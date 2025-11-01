/// <reference types="vite/client" />

// Allow importing web workers like: new Worker(new URL('./foo.worker.ts', import.meta.url))
declare module '*?worker' {
  const workerFactory: new () => Worker
  export default workerFactory
}

declare module '*.worker.ts' {
  const workerFactory: new () => Worker
  export default workerFactory
}
