declare module 'd3-flextree' {
  export function flextree(options?: {
    children?: (data: unknown) => unknown[] | null;
    nodeSize?: (node: unknown) => [number, number];
    spacing?: (a: unknown, b: unknown) => number;
  }): {
    hierarchy: (data: unknown) => {
      descendants: () => Array<{ x: number; depth: number; data: { id: string } }>;
    };
    (root: unknown): void;
  };
}
