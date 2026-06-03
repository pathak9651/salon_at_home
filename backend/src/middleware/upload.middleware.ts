import { NextFunction, Request, Response } from "express";
import sharp from "sharp";
import { HttpError } from "../utils/http-error";

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMimeType = typeof allowedMimeTypes[number];

export const imageExtensionByType: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function normalizeUploadedImage(buffer: Buffer, contentType: string) {
  const image = sharp(buffer, { limitInputPixels: 16_000_000 }).rotate();
  if (contentType === "image/jpeg") return image.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  if (contentType === "image/png") return image.png({ compressionLevel: 9 }).toBuffer();
  if (contentType === "image/webp") return image.webp({ quality: 85 }).toBuffer();
  throw new HttpError(415, "Only JPG, PNG, or WEBP images are supported");
}

function detectImageMime(buffer: Buffer): AllowedImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) return "image/png";
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

export function requireImageUpload(req: Request, _res: Response, next: NextFunction) {
  const contentType = req.header("content-type") ?? "";
  if (!allowedMimeTypes.includes(contentType as AllowedImageMimeType)) {
    return next(new HttpError(415, "Only JPG, PNG, or WEBP images are supported"));
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return next(new HttpError(400, "Upload an image file"));
  }
  const detectedMime = detectImageMime(req.body);
  if (!detectedMime || detectedMime !== contentType) {
    return next(new HttpError(415, "Uploaded file does not match a supported image type"));
  }
  next();
}
