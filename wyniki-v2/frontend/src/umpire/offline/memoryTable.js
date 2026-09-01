export function createMemoryTable() {
  const rows = [];
  let seq = 1;

  return {
    async all() {
      return rows.map((row) => ({ ...row }));
    },

    async put(row) {
      const next = { ...row };
      if (next.id == null) next.id = seq++;
      const index = rows.findIndex((item) => item.id === next.id);
      if (index >= 0) rows[index] = next;
      else rows.push(next);
      return next.id;
    },

    async delete(id) {
      const index = rows.findIndex((item) => item.id === id);
      if (index >= 0) rows.splice(index, 1);
    },

    async clear() {
      rows.length = 0;
    },
  };
}
