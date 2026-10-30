import { createContext } from "react";

/** A theory step becomes eligible for server completion only after the reader
 * reaches the actual end marker or explicitly confirms a short text. */
export const TheoryReadingContext = createContext(false);
