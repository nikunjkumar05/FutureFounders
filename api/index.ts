import type { Request, Response } from "express";

let app: any;

export default async function handler(req: Request, res: Response) {
  if (!app) {
    const mod = await import("../apps/api/dist/app.js");
    app = mod.app;
  }
  return app(req, res);
}
