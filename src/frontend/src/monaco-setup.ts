import {loader} from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
(self as unknown as {MonacoEnvironment:{getWorker:()=>Worker}}).MonacoEnvironment={getWorker:()=>new EditorWorker()};
monaco.editor.defineTheme('torque',{base:'vs-dark',inherit:true,rules:[{token:'keyword',foreground:'C5A5CE'},{token:'string',foreground:'D9B18A'},{token:'comment',foreground:'80976E'},{token:'number',foreground:'E0B56E'}],colors:{'editor.background':'#20231E','editor.foreground':'#DCE6CB','editorLineNumber.foreground':'#69775B','editorLineNumber.activeForeground':'#B7C6A4','editorCursor.foreground':'#FA4B23','editor.selectionBackground':'#FA4B2335','editor.inactiveSelectionBackground':'#FA4B2318','editor.lineHighlightBackground':'#FFFFFF04','editorWidget.background':'#293022','editorWidget.border':'#59684A','editorIndentGuide.background1':'#FFFFFF08','scrollbarSlider.background':'#A1B58B25'}});
loader.config({monaco});
