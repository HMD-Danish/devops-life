import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "new", label: "New", tone: "bg-success/12 text-success" },
  { value: "improved", label: "Improved", tone: "bg-primary/12 text-primary" },
  { value: "fixed", label: "Fixed", tone: "bg-warning/12 text-warning" },
  { value: "removed", label: "Removed", tone: "bg-danger/12 text-danger" },
];

export const toneOf = (type) => (TYPES.find((item) => item.value === type) || TYPES[0]).tone;
const labelOf = (type) => (TYPES.find((item) => item.value === type) || TYPES[0]).label;

export const makeChange = () => ({
  id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: "new",
  text: "",
});

/** One row per change: a type chip, a line of text, drag to reorder, delete. */
export default function ChangesEditor({ rows, onChange }) {
  const setRow = (id, patch) => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const remove = (id) => onChange(rows.filter((row) => row.id !== id));

  const reorder = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...rows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <DragDropContext onDragEnd={reorder}>
        <Droppable droppableId="changes">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {rows.map((row, index) => (
                <Draggable key={row.id} draggableId={row.id} index={index}>
                  {(handle, state) => (
                    <div
                      ref={handle.innerRef}
                      {...handle.draggableProps}
                      className={cn(
                        "flex items-center gap-2 rounded-inner border border-separator/60 bg-surface/60 p-1.5",
                        state.isDragging && "shadow-[0_12px_30px_-18px_rgba(15,23,42,0.5)]"
                      )}
                    >
                      <span
                        {...handle.dragHandleProps}
                        aria-label="Reorder"
                        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-label-secondary active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </span>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "press h-8 shrink-0 rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.05em]",
                              toneOf(row.type)
                            )}
                          >
                            {labelOf(row.type)}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="glass-thick w-40 border-white/50 p-1.5">
                          {TYPES.map((type) => (
                            <DropdownMenuItem
                              key={type.value}
                              className="min-h-[38px] rounded-inner text-[13px]"
                              onClick={() => setRow(row.id, { type: type.value })}
                            >
                              {type.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <input
                        value={row.text}
                        maxLength={200}
                        onChange={(event) => setRow(row.id, { text: event.target.value })}
                        placeholder="One line about what changed"
                        className="h-9 min-w-0 flex-1 bg-transparent px-1 text-[13.5px] outline-none placeholder:text-label-secondary"
                      />

                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        aria-label="Delete this change"
                        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => onChange([...rows, makeChange()])}
          disabled={rows.length >= 30}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add change
        </Button>
        <span className="type-caption text-[11px]">{rows.length} / 30</span>
      </div>
    </div>
  );
}