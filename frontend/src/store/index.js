import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import tunnelsReducer from './slices/tunnelsSlice'
import modulesReducer from './slices/modulesSlice'
import commandsReducer from './slices/commandsSlice'
import historyReducer from './slices/historySlice'
import filesReducer from './slices/filesSlice'
import routesReducer from './slices/routesSlice'
import routeProxiesReducer from './slices/routeProxiesSlice'
import settingsReducer from './slices/settingsSlice'
import moduleControlReducer from './slices/moduleControlSlice'
import themeReducer from './slices/themeSlice'
import alertReducer from './slices/alertSlice'
import agentReducer from './slices/agentSlice'
import usersReducer from './slices/usersSlice'
import tunnelGroupsReducer from './slices/tunnelGroupsSlice'

const store = configureStore({
  reducer: {
    auth: authReducer,
    tunnels: tunnelsReducer,
    modules: modulesReducer,
    commands: commandsReducer,
    history: historyReducer,
    files: filesReducer,
    routes: routesReducer,
    routeProxies: routeProxiesReducer,
    settings: settingsReducer,
    moduleControl: moduleControlReducer,
    theme: themeReducer,
    alert: alertReducer,
    agent: agentReducer,
    users: usersReducer,
    tunnelGroups: tunnelGroupsReducer
  }
})

export default store

