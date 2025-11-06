import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function withRetry<T>({ tries = 3, timeOut = 50 }: { tries?: number, timeOut?: number }, fn: (...args: any[]) => T) {
  let error;
  for (let i = 0; i < tries; i++) {
    try {
      return fn()
    } catch (e) {
      // Assume pure function, so store just the last error
      error = e;
      console.warn(`>>>${i}. Retrying ${fn.name}`)
      let timer;

      await new Promise(resolve => {
        timer = setTimeout(resolve, timeOut)
      })
      clearTimeout(timer)
    }
  }
  console.error(error)
  throw error



}
