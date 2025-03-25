import { NCoreInitShell } from './base';
import { GlobalFonts } from '@napi-rs/canvas';
GlobalFonts.registerFromPath('C:\\fonts\\JetBrainsMono.ttf', 'JetBrains Mono');
GlobalFonts.registerFromPath('C:\\fonts\\AaCute.ttf', 'Aa偷吃可爱长大的');
NCoreInitShell();