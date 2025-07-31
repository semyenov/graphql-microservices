export interface BuildOptions {
  service?: string;
  watch?: boolean;
  format?: 'esm' | 'cjs' | ('esm' | 'cjs')[];
  minify?: boolean;
  sourcemap?: boolean;
  dts?: boolean;
  tsconfig?: string;
}

export interface ServiceBuildConfig {
  name: string;
  path: string;
  entry: string;
  outDir: string;
}
