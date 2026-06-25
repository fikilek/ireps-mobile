const authenticatedApiLoaders = [
  () => import("./accountDataApi").then((module) => module.accountDataApi),
  () => import("./astsApi").then((module) => module.astsApi),
  () => import("./bgoApi").then((module) => module.bgoApi),
  () => import("./erfsApi").then((module) => module.erfsApi),
  () => import("./geofenceApi").then((module) => module.geofenceApi),
  () => import("./geoApi").then((module) => module.geoApi),
  () =>
    import("./irepsSelectLookupsApi").then(
      (module) => module.irepsSelectLookupsApi,
    ),
  () =>
    import("./lifecycleInstructionApi").then(
      (module) => module.lifecycleInstructionApi,
    ),
  () => import("./premisesApi").then((module) => module.premisesApi),
  () => import("./salesApi").then((module) => module.salesApi),
  () => import("./settingsApi").then((module) => module.settingsApi),
  () => import("./spApi").then((module) => module.spApi),
  () => import("./teamsApi").then((module) => module.teamsApi),
  () => import("./trnsApi").then((module) => module.trnsApi),
  () => import("./usersApi").then((module) => module.usersApi),
];

export async function resetAuthenticatedApiStates(dispatch) {
  const apis = await Promise.all(
    authenticatedApiLoaders.map((loadApi) => loadApi()),
  );

  apis.filter(Boolean).forEach((api) => {
    dispatch(api.util.resetApiState());
  });
}
