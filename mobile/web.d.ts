// Globals and imports only the web build (vite.config.ts) has.

// The web-controller origin baked in at build time; '' means same origin.
declare const __API_ORIGIN__: string

declare module '*?url' {
  const url: string
  export default url
}
