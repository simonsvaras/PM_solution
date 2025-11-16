import { type ReactNode } from 'react';
import { DndContext, type DragEndEvent, type SensorDescriptor } from '@dnd-kit/core';
import './PlannerBoard.css';

export type PlannerBoardProps = {
  sensors: SensorDescriptor<any>[];
  onDragEnd?: (event: DragEndEvent) => void;
  backlogColumn: ReactNode;
  weeksColumn: ReactNode;
  emptyState?: ReactNode;
};

export default function PlannerBoard({ sensors, onDragEnd, backlogColumn, weeksColumn, emptyState }: PlannerBoardProps) {
  return (
    <section className="plannerBoard">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="projectWeeklyPlanner__board">
          {backlogColumn}
          {weeksColumn}
        </div>
      </DndContext>
      {emptyState && <div className="plannerBoard__emptyState">{emptyState}</div>}
    </section>
  );
}
