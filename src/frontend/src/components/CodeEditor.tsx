// Monaco lives only here, behind React.lazy, so the editor is its own chunk (G9): nothing in the initial bundle
// or the Workspace route chunk pulls in monaco-editor.
import Editor,{type EditorProps} from '@monaco-editor/react';
import '../monaco-setup';
export default function CodeEditor(props:EditorProps){return <Editor {...props}/>;}
