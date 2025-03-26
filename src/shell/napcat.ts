import { dirname, join } from 'node:path';
import { NCoreInitShell } from './base';
import { GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

let current_path = dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(join(current_path, '.\\fonts\\JetBrainsMono.ttf'), 'JetBrains Mono');
GlobalFonts.registerFromPath(join(current_path, '.\\fonts\\AaCute.ttf', 'Aa偷吃可爱长大的'));
NCoreInitShell();