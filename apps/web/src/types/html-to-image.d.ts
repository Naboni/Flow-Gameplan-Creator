declare module "html-to-image" {
  export type ToImageOptions = {
    cacheBust?: boolean;
    backgroundColor?: string;
    pixelRatio?: number;
  };

  export function toPng(node: HTMLElement, options?: ToImageOptions): Promise<string>;
}
