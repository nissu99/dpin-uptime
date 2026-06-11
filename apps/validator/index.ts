import { randomUUIDv7 } from "bun";
import { Keypair } from "@solana/web3.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  SignupOutgoingMessage,
  ValidateOutgoingMessage,
} from "common/types";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";

interface SignupCallback {
  timeout: ReturnType<typeof setTimeout>;
  handle: (data: SignupOutgoingMessage) => void;
}

const callbacks: Record<string, SignupCallback> = {};

const HUB_URL = process.env.HUB_URL ?? "ws://localhost:8081";
const VALIDATOR_IP = process.env.VALIDATOR_IP ?? "127.0.0.1";
const SIGNUP_TIMEOUT_MS = Number(process.env.SIGNUP_TIMEOUT_MS ?? 30 * 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 10 * 1000);
const RECONNECT_DELAY_MS = Number(process.env.RECONNECT_DELAY_MS ?? 5 * 1000);

let validatorId: string | null = null;

async function main() {
  const keypair = getKeypairFromEnv();
  connect(keypair);
}

function connect(keypair: Keypair) {
  const ws = new WebSocket(HUB_URL);
  const publicKey = keypair.publicKey.toBase58();

  ws.onopen = () => {
    void signup(ws, keypair, publicKey).catch((error) => {
      console.error("Validator signup failed", error);
      ws.close();
    });
  };

  ws.onmessage = (event) => {
    void handleMessage(ws, event.data, keypair).catch((error) => {
      console.error("Validator message handler failed", error);
    });
  };

  ws.onerror = (event) => {
    console.error("Validator websocket error", event);
  };

  ws.onclose = () => {
    validatorId = null;
    clearSignupCallbacks();

    setTimeout(() => connect(keypair), RECONNECT_DELAY_MS);
  };
}

async function signup(ws: WebSocket, keypair: Keypair, publicKey: string) {
  const callbackId = randomUUIDv7();
  const signedMessage = await signMessage(
    `Signed message for ${callbackId}, ${publicKey}`,
    keypair,
  );

  callbacks[callbackId] = {
    timeout: setTimeout(() => {
      delete callbacks[callbackId];
      ws.close();
    }, SIGNUP_TIMEOUT_MS),
    handle: (data) => {
      validatorId = data.validatorId;
      console.log(`Validator registered as ${validatorId}`);
    },
  };

  ws.send(
    JSON.stringify({
      type: "signup",
      data: {
        callbackId,
        ip: VALIDATOR_IP,
        publicKey,
        signedMessage,
      },
    } satisfies IncomingMessage),
  );
}

async function handleMessage(
  ws: WebSocket,
  rawMessage: unknown,
  keypair: Keypair,
) {
  const data = parseOutgoingMessage(rawMessage);

  if (!data) {
    return;
  }

  if (data.type === "signup") {
    const callback = callbacks[data.data.callbackId];

    if (!callback) {
      return;
    }

    clearTimeout(callback.timeout);
    delete callbacks[data.data.callbackId];
    callback.handle(data.data);
    return;
  }

  await validateHandler(ws, data.data, keypair);
}

async function validateHandler(
  ws: WebSocket,
  { url, callbackId, websiteId }: ValidateOutgoingMessage,
  keypair: Keypair,
) {
  if (!validatorId) {
    return;
  }

  const startTime = Date.now();

  try {
    const response = await fetchWithTimeout(url);
    const latency = Date.now() - startTime;

    await sendValidationResult(ws, keypair, {
      callbackId,
      websiteId,
      status: response.ok ? "Good" : "Bad",
      latency,
      validatorId,
    });
  } catch (error) {
    const latency = Date.now() - startTime;

    await sendValidationResult(ws, keypair, {
      callbackId,
      websiteId,
      status: "Bad",
      latency,
      validatorId,
    });

    console.error(`Validation failed for ${url}`, error);
  }
}

async function sendValidationResult(
  ws: WebSocket,
  keypair: Keypair,
  result: Omit<IncomingMessage["data"], "signedMessage"> & {
    callbackId: string;
    websiteId: string;
    validatorId: string;
    status: "Good" | "Bad";
    latency: number;
  },
) {
  const signedMessage = await signMessage(
    `Replying to ${result.callbackId}`,
    keypair,
  );

  ws.send(
    JSON.stringify({
      type: "validate",
      data: {
        ...result,
        signedMessage,
      },
    } satisfies IncomingMessage),
  );
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function signMessage(message: string, keypair: Keypair) {
  const messageBytes = nacl_util.decodeUTF8(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

  return JSON.stringify(Array.from(signature));
}

function getKeypairFromEnv() {
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required to start a validator");
  }

  try {
    const parsed = JSON.parse(privateKey) as unknown;

    if (
      !Array.isArray(parsed) ||
      parsed.some((value) => typeof value !== "number")
    ) {
      throw new Error("PRIVATE_KEY must be a JSON array of numbers");
    }

    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch (error) {
    throw new Error(`Invalid PRIVATE_KEY: ${(error as Error).message}`);
  }
}

function clearSignupCallbacks() {
  for (const [callbackId, callback] of Object.entries(callbacks)) {
    clearTimeout(callback.timeout);
    delete callbacks[callbackId];
  }
}

function parseOutgoingMessage(rawMessage: unknown): OutgoingMessage | null {
  try {
    const parsed = JSON.parse(String(rawMessage)) as unknown;

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

function isSignupData(value: unknown): value is SignupOutgoingMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.validatorId === "string" && typeof data.callbackId === "string"
  );
}

function isValidateData(value: unknown): value is ValidateOutgoingMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.url === "string" &&
    typeof data.callbackId === "string" &&
    typeof data.websiteId === "string"
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
