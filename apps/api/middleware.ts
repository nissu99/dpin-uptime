import { verifyToken } from "@clerk/backend";
import type { NextFunction, Request, Response } from "express";

const authorizedParties =
  process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((party) => party.trim())
    .filter(Boolean) ?? [];

function getTokenFromHeader(header: string | undefined) {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() === "bearer" && token) {
    return token;
  }

  return header;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getTokenFromHeader(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    res.status(500).json({ error: "Authentication is not configured" });
    return;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey,
      ...(authorizedParties.length > 0 ? { authorizedParties } : {}),
    });

    if (!payload.sub) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.userId = payload.sub;
    next();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "Clerk token verification failed:",
        error instanceof Error ? error.message : error,
      );
    }

    res.status(401).json({ error: "Unauthorized" });
  }
}
