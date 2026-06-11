import { randomUUIDv7, type ServerWebSocket } from "bun";
import { PublicKey } from "@solana/web3.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  SignupIncomingMessage,
  ValidateIncomingMessage,
} from "common/types";
import { prismaClient } from "db/client";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";

interface ConnectedValidator {
  validatorId: string;
  socket: ServerWebSocket<unknown>;
  publicKey: string;
}

interface ValidationCallback {
  validator: ConnectedValidator;
  timeout: ReturnType<typeof setTimeout>;
  handle: (data: ValidateIncomingMessage) => Promise<void>;
}

const availableValidators: ConnectedValidator[] = [];
const callbacks: Record<string, ValidationCallback> = {};

const COST_PER_VALIDATION = 100; // in lamports
const HUB_PORT = Number(process.env.PORT ?? process.env.HUB_PORT ?? 8081);
const VALIDATION_INTERVAL_MS = Number(
  process.env.VALIDATION_INTERVAL_MS ?? 60 * 1000,
);
const VALIDATION_TIMEOUT_MS = Number(
  process.env.VALIDATION_TIMEOUT_MS ?? 30 * 1000,
);

Bun.serve({
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (server.upgrade(req)) {
      return;
    }

    return new Response("WebSocket upgrade required", { status: 426 });
  },
  port: HUB_PORT,
  websocket: {
    async message(ws: ServerWebSocket<unknown>, message: string) {
      const data = parseIncomingMessage(message);

      if (!data) {
        ws.close(1003, "Invalid message");
        return;
      }

      try {
        if (data.type === "signup") {
          const verified = await verifyMessage(
            `Signed message for ${data.data.callbackId}, ${data.data.publicKey}`,
            data.data.publicKey,
            data.data.signedMessage,
          );

          if (!verified) {
            ws.close(1008, "Invalid signature");
            return;
          }

          await signupHandler(ws, data.data);
          return;
        }

        const callback = callbacks[data.data.callbackId];

        if (!callback) {
          return;
        }

        clearTimeout(callback.timeout);
        delete callbacks[data.data.callbackId];
        await callback.handle(data.data);
      } catch (error) {
        console.error("Hub message handler failed", error);
      }
    },
    close(ws: ServerWebSocket<unknown>) {
      removeValidatorSocket(ws);
    },
  },
});

console.log(`Hub listening on ws://localhost:${HUB_PORT}`);

async function signupHandler(
  ws: ServerWebSocket<unknown>,
  { ip, publicKey, callbackId }: SignupIncomingMessage,
) {
  const validatorDb =
    (await prismaClient.validator.findFirst({
      where: {
        publicKey,
      },
    })) ??
    (await prismaClient.validator.create({
      data: {
        ip,
        publicKey,
        location: "unknown",
      },
    }));

  removeValidatorSocket(ws);
  removeValidatorByPublicKey(publicKey);

  ws.send(
    JSON.stringify({
      type: "signup",
      data: {
        validatorId: validatorDb.id,
        callbackId,
      },
    } satisfies OutgoingMessage),
  );

  availableValidators.push({
    validatorId: validatorDb.id,
    socket: ws,
    publicKey: validatorDb.publicKey,
  });
}

function removeValidatorSocket(ws: ServerWebSocket<unknown>) {
  for (let index = availableValidators.length - 1; index >= 0; index--) {
    if (availableValidators[index]?.socket === ws) {
      availableValidators.splice(index, 1);
    }
  }

  removeCallbacksForSocket(ws);
}

function removeValidatorByPublicKey(publicKey: string) {
  for (let index = availableValidators.length - 1; index >= 0; index--) {
    if (availableValidators[index]?.publicKey === publicKey) {
      const [validator] = availableValidators.splice(index, 1);

      if (validator) {
        removeCallbacksForSocket(validator.socket);
      }
    }
  }
}

function removeCallbacksForSocket(ws: ServerWebSocket<unknown>) {
  for (const [callbackId, callback] of Object.entries(callbacks)) {
    if (callback.validator.socket === ws) {
      clearTimeout(callback.timeout);
      delete callbacks[callbackId];
    }
  }
}

async function verifyMessage(
  message: string,
  publicKey: string,
  signature: string,
) {
  try {
    const parsedSignature = JSON.parse(signature) as unknown;

    if (
      !Array.isArray(parsedSignature) ||
      parsedSignature.some((value) => typeof value !== "number")
    ) {
      return false;
    }

    const messageBytes = nacl_util.decodeUTF8(message);

    return nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(parsedSignature),
      new PublicKey(publicKey).toBytes(),
    );
  } catch {
    return false;
  }
}

async function runValidationCycle() {
  if (availableValidators.length === 0) {
    return;
  }

  const websitesToMonitor = await prismaClient.website.findMany({
    where: {
      disabled: false,
    },
    select: {
      id: true,
      url: true,
    },
  });

  for (const website of websitesToMonitor) {
    for (const validator of [...availableValidators]) {
      sendValidationRequest(validator, website);
    }
  }
}

function sendValidationRequest(
  validator: ConnectedValidator,
  website: { id: string; url: string },
) {
  const callbackId = randomUUIDv7();
  const message: OutgoingMessage = {
    type: "validate",
    data: {
      url: website.url,
      callbackId,
      websiteId: website.id,
    },
  };

  callbacks[callbackId] = {
    validator,
    timeout: setTimeout(() => {
      delete callbacks[callbackId];
    }, VALIDATION_TIMEOUT_MS),
    handle: async (data) => {
      if (
        data.validatorId !== validator.validatorId ||
        data.websiteId !== website.id
      ) {
        return;
      }

      const verified = await verifyMessage(
        `Replying to ${callbackId}`,
        validator.publicKey,
        data.signedMessage,
      );

      if (!verified) {
        return;
      }

      await prismaClient.$transaction(async (tx) => {
        await tx.websiteTick.create({
          data: {
            websiteId: website.id,
            validatorId: validator.validatorId,
            status: data.status,
            latency: Math.max(0, data.latency),
            createdAt: new Date(),
          },
        });

        await tx.validator.update({
          where: { id: validator.validatorId },
          data: {
            pendingPayouts: { increment: COST_PER_VALIDATION },
          },
        });
      });
    },
  };

  try {
    validator.socket.send(JSON.stringify(message));
  } catch (error) {
    clearTimeout(callbacks[callbackId]?.timeout);
    delete callbacks[callbackId];
    removeValidatorSocket(validator.socket);
    console.error("Failed to send validation request", error);
  }
}

function parseIncomingMessage(rawMessage: string): IncomingMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as unknown;

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }

    const message = parsed as { type: unknown; data: unknown };

    if (message.type === "signup" && isSignupData(message.data)) {
      return { type: "signup", data: message.data };
    }

    if (message.type === "validate" && isValidateData(message.data)) {
      return { type: "validate", data: message.data };
    }

    return null;
  } catch {
    return null;
  }
}

function isSignupData(value: unknown): value is SignupIncomingMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.ip === "string" &&
    typeof data.publicKey === "string" &&
    typeof data.signedMessage === "string" &&
    typeof data.callbackId === "string"
  );
}

function isValidateData(value: unknown): value is ValidateIncomingMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.callbackId === "string" &&
    typeof data.signedMessage === "string" &&
    (data.status === "Good" || data.status === "Bad") &&
    typeof data.latency === "number" &&
    Number.isFinite(data.latency) &&
    typeof data.websiteId === "string" &&
    typeof data.validatorId === "string"
  );
}

setInterval(() => {
  void runValidationCycle().catch((error) => {
    console.error("Validation cycle failed", error);
  });
}, VALIDATION_INTERVAL_MS);
