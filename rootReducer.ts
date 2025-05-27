import { combineReducers } from '@reduxjs/toolkit';
import counterReducer from './counter.slice';  // <-- default import

const rootReducer = combineReducers({
  counter: counterReducer,
});

export default rootReducer;
