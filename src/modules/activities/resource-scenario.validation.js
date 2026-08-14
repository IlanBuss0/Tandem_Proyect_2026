const GAME_TYPE = 'resource-scenario';

function fail(message) {
  throw new Error(`Escenario de recursos invalido: ${message}`);
}

function isInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

export function validateResourceScenario(data) {
  if (!data || typeof data !== 'object') fail('faltan los datos del escenario.');
  if (data.kind === 'shopping-budget') return validateShoppingBudgetScenario(data);

  const resources = Array.isArray(data.resources) ? data.resources : [];
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];

  if (resources.length < 1 || resources.length > 3) fail('debe tener entre 1 y 3 recursos.');
  if (nodes.length < 2 || nodes.length > 12) fail('debe tener entre 2 y 12 nodos.');

  const resourceIds = new Set();
  for (const resource of resources) {
    const id = String(resource?.id || '').trim();
    if (!id || resourceIds.has(id)) fail('los recursos deben tener identificadores unicos.');
    if (!String(resource?.name || '').trim()) fail('cada recurso debe tener nombre.');
    if (![resource?.min, resource?.max, resource?.initial].every(isInteger)) fail('los valores de recursos deben ser enteros.');
    if (resource.min >= resource.max || resource.initial < resource.min || resource.initial > resource.max) {
      fail(`el recurso ${resource.name} tiene limites invalidos.`);
    }
    resourceIds.add(id);
  }

  const nodeById = new Map();
  for (const node of nodes) {
    const id = String(node?.id || '').trim();
    if (!id || nodeById.has(id)) fail('los nodos deben tener identificadores unicos.');
    if (!String(node?.prompt || '').trim()) fail('cada nodo debe tener una consigna.');
    nodeById.set(id, node);
  }

  const startNodeId = String(data.startNodeId || '').trim();
  if (!nodeById.has(startNodeId)) fail('el nodo inicial no existe.');

  for (const node of nodes) {
    const options = Array.isArray(node.options) ? node.options : [];
    if (node.terminal) {
      if (options.length > 0) fail('los nodos finales no pueden tener opciones.');
      continue;
    }
    if (options.length < 2 || options.length > 4) fail('cada decision debe tener entre 2 y 4 opciones.');
    for (const option of options) {
      if (!String(option?.label || '').trim()) fail('cada opcion debe tener texto.');
      if (!isInteger(option?.score) || option.score < 0 || option.score > 100) fail('el puntaje de cada opcion debe ser un entero entre 0 y 100.');
      if (!nodeById.has(String(option?.nextNodeId || ''))) fail('cada opcion debe apuntar a un nodo existente.');
      const deltas = option.resourceDeltas && typeof option.resourceDeltas === 'object' ? option.resourceDeltas : {};
      for (const [resourceId, delta] of Object.entries(deltas)) {
        if (!resourceIds.has(resourceId) || !isInteger(delta)) fail('las variaciones de recursos deben usar recursos existentes y valores enteros.');
      }
    }
  }

  const visited = new Set();
  const active = new Set();
  const visit = (nodeId) => {
    if (active.has(nodeId)) fail('no se permiten ciclos.');
    if (visited.has(nodeId)) return;
    active.add(nodeId);
    const node = nodeById.get(nodeId);
    for (const option of node.options || []) visit(String(option.nextNodeId));
    active.delete(nodeId);
    visited.add(nodeId);
  };
  visit(startNodeId);
  if (visited.size !== nodes.length) fail('todos los nodos deben ser alcanzables desde el inicio.');
  if (!nodes.some((node) => node.terminal)) fail('debe existir al menos un desenlace.');

  return data;
}

function validateShoppingBudgetScenario(data) {
  if (data.schemaVersion !== 1) fail('la version de la compra no es valida.');
  if (!String(data.prompt || '').trim()) fail('la compra debe tener una consigna.');
  const currencySymbol = String(data.currencySymbol || '').trim();
  if (!currencySymbol || currencySymbol.length > 4) fail('el simbolo monetario no es valido.');
  if (!isInteger(data.budget) || data.budget <= 0) fail('el presupuesto debe ser un entero mayor que cero.');

  const products = Array.isArray(data.products) ? data.products : [];
  if (products.length < 3 || products.length > 12) fail('el catalogo debe tener entre 3 y 12 productos.');

  const ids = new Set();
  const names = new Set();
  for (const product of products) {
    const id = String(product?.id || '').trim();
    const name = String(product?.name || '').trim();
    const normalizedName = name.toLocaleLowerCase('es');
    if (!id || ids.has(id)) fail('cada producto debe tener un identificador unico.');
    if (!normalizedName || names.has(normalizedName)) fail('cada producto debe tener un nombre diferente.');
    if (!String(product?.image || '').trim()) fail(`el producto ${name || 'sin nombre'} debe tener un pictograma o emoji.`);
    if (!isInteger(product?.price) || product.price <= 0) fail(`el precio de ${name} debe ser un entero mayor que cero.`);
    if (typeof product.required !== 'boolean') fail(`el producto ${name} debe indicar si pertenece a la lista.`);
    ids.add(id);
    names.add(normalizedName);
  }

  const required = products.filter((product) => product.required);
  if (!required.length) fail('la lista de compras debe tener al menos un producto.');
  if (required.length === products.length) fail('el catalogo debe incluir al menos un producto extra.');
  if (required.reduce((sum, product) => sum + product.price, 0) > data.budget) {
    fail('el presupuesto debe alcanzar para todos los productos de la lista.');
  }
  return data;
}

export function validateResourceScenarioMetadata(description) {
  const line = String(description || '').split(/\r?\n/).find((item) => item.trim().startsWith('Juego:'));
  if (!line) return null;
  const raw = line.replace(/^\s*Juego:\s*/i, '');
  let metadata;
  try {
    metadata = JSON.parse(raw);
  } catch {
    return null;
  }
  if (metadata?.gameType !== GAME_TYPE) return null;
  return validateResourceScenario(metadata.gameData?.resourceScenario);
}
