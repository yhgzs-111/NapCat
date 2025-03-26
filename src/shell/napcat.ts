
import { NCoreInitShell } from './base';
import { GlobalFonts } from '@napi-rs/canvas';
import { current_path } from '@/plugin/data';
import path from 'path';

GlobalFonts.registerFromPath(path.join(current_path, './fonts/JetBrainsMono.ttf'), 'JetBrains Mono');
GlobalFonts.registerFromPath(path.join(current_path, './fonts/AaCute.ttf'), 'Aa偷吃可爱长大的');
console.log('字体注册完成');
NCoreInitShell();