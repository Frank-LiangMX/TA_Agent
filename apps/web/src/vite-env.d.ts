/// <reference types="vite/client" />

declare module '*.css' {
  const content: Record<string, string>
  export default content
}

declare module '*.wav' { const src: string; export default src }
declare module '*.mp3' { const src: string; export default src }
