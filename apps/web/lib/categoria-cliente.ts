/** Busca una categoría por nombre/tipo (y opcionalmente padre) o la crea si no existe — usado por el asistente de carga inicial para no duplicar categorías al ir guardando sobre la marcha. */
export async function obtenerOCrearCategoria(
  token: string,
  espacioId: string,
  tipo: 'ingreso' | 'gasto',
  nombre: string,
  categoriaPadreId: string | null = null
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };

  const respuestaLista = await fetch(`/api/categorias?espacio_id=${espacioId}&tipo=${tipo}`, { headers });
  if (!respuestaLista.ok) throw new Error('No se han podido consultar las categorías.');
  const { data: categorias } = (await respuestaLista.json()) as {
    data: { id: string; nombre: string; categoria_padre_id: string | null }[];
  };

  const existente = (categorias ?? []).find(
    (c) => c.nombre === nombre && c.categoria_padre_id === categoriaPadreId
  );
  if (existente) return existente.id;

  const respuestaCrear = await fetch('/api/categorias', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ espacio_id: espacioId, tipo, nombre, categoria_padre_id: categoriaPadreId }),
  });
  if (!respuestaCrear.ok) {
    const cuerpo = await respuestaCrear.json();
    throw new Error(cuerpo.error ?? `No se ha podido crear la categoría "${nombre}".`);
  }
  const { data: creada } = await respuestaCrear.json();
  return creada.id;
}
