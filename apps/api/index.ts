import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { prismaClient } from "db/client";

import { authMiddleware } from "./middleware";

const app = express();
const PORT = Number(process.env.PORT ?? 8080);
const TICKS_PER_WEBSITE = 100;

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function asyncHandler(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") {
    throw Object.assign(new Error("URL is required"), { statusCode: 400 });
  }

  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return url.toString();
  } catch {
    throw Object.assign(new Error("Invalid URL"), { statusCode: 400 });
  }
}

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/v1/website",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const url = normalizeUrl(req.body.url);

    const existingWebsite = await prismaClient.website.findFirst({
      where: {
        userId,
        url,
      },
      select: {
        id: true,
        disabled: true,
      },
    });

    if (existingWebsite) {
      if (existingWebsite.disabled) {
        await prismaClient.website.update({
          where: { id: existingWebsite.id },
          data: { disabled: false },
        });
      }

      res.json({ id: existingWebsite.id });
      return;
    }

    const data = await prismaClient.website.create({
      data: {
        userId,
        url,
      },
    });

    res.status(201).json({
      id: data.id,
    });
  }),
);

app.get(
  "/api/v1/website/status",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const websiteId = req.query.websiteId;
    const userId = req.userId!;

    if (typeof websiteId !== "string") {
      res.status(400).json({ error: "Website ID is required" });
      return;
    }

    const website = await prismaClient.website.findFirst({
      where: {
        id: websiteId,
        userId,
        disabled: false,
      },
      include: {
        ticks: {
          orderBy: { createdAt: "desc" },
          take: TICKS_PER_WEBSITE,
        },
      },
    });

    if (!website) {
      res.status(404).json({ error: "Website not found" });
      return;
    }

    res.json(website);
  }),
);

app.get(
  "/api/v1/websites",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;

    const websites = await prismaClient.website.findMany({
      where: {
        userId,
        disabled: false,
      },
      include: {
        ticks: {
          orderBy: { createdAt: "desc" },
          take: TICKS_PER_WEBSITE,
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    res.json({
      websites,
    });
  }),
);

app.delete(
  "/api/v1/website",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const websiteId = req.body.websiteId;
    const userId = req.userId!;

    if (typeof websiteId !== "string") {
      res.status(400).json({ error: "Website ID is required" });
      return;
    }

    const result = await prismaClient.website.updateMany({
      where: {
        id: websiteId,
        userId,
        disabled: false,
      },
      data: {
        disabled: true,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: "Website not found" });
      return;
    }

    res.json({
      message: "Deleted website successfully",
    });
  }),
);

app.post("/api/v1/payout/:validatorId", (_req, res) => {
  res.status(501).json({ error: "Payouts are not implemented yet" });
});

app.use(
  (
    error: Error & { statusCode?: number },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      console.error(error);
    }

    res.status(statusCode).json({
      error: statusCode >= 500 ? "Internal server error" : error.message,
    });
  },
);

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
