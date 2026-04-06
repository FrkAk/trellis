import { NextResponse } from "next/server";

/**
 * Return a success JSON response.
 * @param data - Response payload.
 * @param status - HTTP status code (default 200).
 * @returns NextResponse with JSON body.
 */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Return an error JSON response.
 * @param message - Human-readable error message.
 * @param status - HTTP status code (default 400).
 * @returns NextResponse with { error } body.
 */
export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
