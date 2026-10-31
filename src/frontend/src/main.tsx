import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import App from './App';
import {AppProvider} from './lib';
import {applyTheme,initialTheme} from './theme';
applyTheme(initialTheme()); // before first paint: no light flash for dark-mode users
createRoot(document.getElementById('root')!).render(<HashRouter><AppProvider><App/></AppProvider></HashRouter>);

