/**
 * @format
 */

import {AppRegistry} from 'react-native';
// import App from './App';
import {name as appName} from './app.json';
// import App from './Screens/App';
import NavigationScreen from './Screens/NavigationScreem';
AppRegistry.registerComponent(appName, () => NavigationScreen);
