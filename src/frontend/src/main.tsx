import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import App from './App';
import {AppProvider} from './lib';
createRoot(document.getElementById('root')!).render(<HashRouter><AppProvider><App/></AppProvider></HashRouter>);

