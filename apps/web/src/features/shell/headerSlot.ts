import { createContext } from 'react';

/** The header's right-hand slot; features portal their menu into it. */
export const HeaderSlot = createContext<HTMLElement | null>(null);
