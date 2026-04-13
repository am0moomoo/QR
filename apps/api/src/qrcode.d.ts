declare module "qrcode" {
  export function toBuffer(
    text: string,
    options?: Record<string, unknown>
  ): Promise<Buffer>;
  export function toString(
    text: string,
    options?: Record<string, unknown>
  ): Promise<string>;
}
