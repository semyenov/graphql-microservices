export interface BuildOptions {
  service?: string;
  watch?: boolean;
  format?: 'esm' | 'cjs' | ('esm' | 'cjs')[];
  minify?: boolean;
  sourcemap?: boolean;
  dts?: boolean; // Enable/disable TypeScript declaration file generation
}

export interface ServiceBuildConfig {
  name: string;
  path: string;
  entry: string;
  outDir: string;
}
