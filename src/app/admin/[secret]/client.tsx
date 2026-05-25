"use client";

import { useState } from "react";
import { addCouple, removeCouple, regenerateSlug, type Couple } from "@/actions/admin";

interface AdminClientProps {
  initialCouples: Couple[];
  adminSecret: string;
}

export function AdminClient({ initialCouples, adminSecret }: AdminClientProps) {
  const [couples, setCouples] = useState<Couple[]>(initialCouples);
  const [newName, setNewName] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const couple = await addCouple(newName.trim());
    setCouples([...couples, couple].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this couple? Their availability data will be deleted.")) return;
    await removeCouple(id);
    setCouples(couples.filter((c) => c.id !== id));
  }

  async function handleRegenerate(id: string, name: string) {
    if (!confirm("Generate a new link? The old link will stop working.")) return;
    const updated = await regenerateSlug(id, name);
    setCouples(couples.map((c) => (c.id === id ? updated : c)));
  }

  function getCoupleUrl(slug: string) {
    return `${window.location.origin}/c/${slug}`;
  }

  async function handleCopy(slug: string) {
    await navigator.clipboard.writeText(getCoupleUrl(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Couple name (e.g. The Smiths)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Add
        </button>
      </form>

      <div className="space-y-3">
        {couples.map((couple) => (
          <div key={couple.id} className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">{couple.name}</span>
              <button
                onClick={() => handleRemove(couple.id)}
                className="text-red-500 text-xs hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 truncate">
                /c/{couple.slug}
              </code>
              <button
                onClick={() => handleCopy(couple.slug)}
                className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                {copiedSlug === couple.slug ? "Copied!" : "Copy Link"}
              </button>
              <button
                onClick={() => handleRegenerate(couple.id, couple.name)}
                className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
              >
                New Link
              </button>
            </div>
          </div>
        ))}
      </div>

      {couples.length === 0 && (
        <p className="text-center text-gray-400 text-sm">
          No couples added yet. Add one above to get started.
        </p>
      )}
    </div>
  );
}
