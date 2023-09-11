import sub from './routes/sub.mjs';

export default (route, graphQLFields, app) => {

  sub(route, app)
  
  return route
}