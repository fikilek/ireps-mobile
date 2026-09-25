const authenticatedApiLoaders = [
  () => import("./accountDataApi").then((module) => module.accountDataApi),
  () => import("./astsApi").then((module) => module.astsApi),
  () => import("./bgoApi").then((module) => module.bgoApi),
  () => import("./erfsApi").then((module) => module.erfsApi),
  () => import("./geofenceApi").then((module) => module.geofenceApi),
  () =>
    import("./informalErfsApi").then((module) => module.informalErfsApi),
  () => import("./geoApi").then((module) => module.geoApi),
  () =>
    import("./lifecycleInstructionApi").then(
      (module) => module.lifecycleInstructionApi,
    ),
  () => import("./premisesApi").then((module) => module.premisesApi),
  () => import("./salesApi").then((module) => module.salesApi),
  () => import("./settingsApi").then((module) => module.settingsApi),
  () => import("./spApi").then((module) => module.spApi),
  // TB-R052: My Work Orders keeps batch connections for 24 hours; sign-out ends them.
  () =>
    import("./targetedBatchApi").then((module) => module.targetedBatchApi),
  () => import("./teamsApi").then((module) => module.teamsApi),
  () => import("./trnsApi").then((module) => module.trnsApi),
  () => import("./usersApi").then((module) => module.usersApi),
];

export async function resetAuthenticatedApiStates(dispatch) {
  // TB-R052: the batches kept live for 24 hours are let go before their caches are reset.
  const { releaseKeptWorkOrders } = await import("./workOrderKeepers");
  releaseKeptWorkOrders();

  const apis = await Promise.all(
    authenticatedApiLoaders.map((loadApi) => loadApi()),
  );

  apis.filter(Boolean).forEach((api) => {
    dispatch(api.util.resetApiState());
  });
}
