// Planted violation, one import away: this file is clean, the module it imports is not.
import { open } from './network-import.js';

export const indirect = open;
