import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Undo, Redo, Equal } from 'lucide-react';
import { computeGrid, type RawData } from './utils';

const COLS = Array.from({ length: 10 }, (_, i) => String.fromCharCode(65 + i)); // A-J
const ROWS = Array.from({ length: 10 }, (_, i) => i + 1); // 1-10

type SelectionRange = {
  start: string;
  end: string;
};

function parseCell(cellId: string) {
  const match = cellId.toUpperCase().match(/^([A-J])(10|[1-9])$/);
  if (!match) return null;
  return {
    col: COLS.indexOf(match[1]),
    row: ROWS.indexOf(Number(match[2]))
  };
}

function cellId(col: number, row: number) {
  return `${COLS[col]}${ROWS[row]}`;
}

function normalizeRange(start: string, end: string) {
  const startCoord = parseCell(start);
  const endCoord = parseCell(end);
  if (!startCoord || !endCoord) {
    return { start, end };
  }
  const minCol = Math.min(startCoord.col, endCoord.col);
  const maxCol = Math.max(startCoord.col, endCoord.col);
  const minRow = Math.min(startCoord.row, endCoord.row);
  const maxRow = Math.max(startCoord.row, endCoord.row);
  return {
    start: cellId(minCol, minRow),
    end: cellId(maxCol, maxRow)
  };
}

function getCellsInRange(start: string, end: string) {
  const normalized = normalizeRange(start, end);
  const startCoord = parseCell(normalized.start)!;
  const endCoord = parseCell(normalized.end)!;
  const selected: Set<string> = new Set();
  for (let col = startCoord.col; col <= endCoord.col; col += 1) {
    for (let row = startCoord.row; row <= endCoord.row; row += 1) {
      selected.add(cellId(col, row));
    }
  }
  return selected;
}

function formatRange(start: string, end: string) {
  const normalized = normalizeRange(start, end);
  return normalized.start === normalized.end ? normalized.start : `${normalized.start}:${normalized.end}`;
}

interface HistoryState {
  past: RawData[];
  present: RawData;
  future: RawData[];
}

export default function Spreadsheet() {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: {},
    future: []
  });

  const [activeCell, setActiveCell] = useState('A1');
  const [selection, setSelection] = useState<SelectionRange>({ start: 'A1', end: 'A1' });
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const isSelecting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const data = history.present;
  const computedData = useMemo(() => computeGrid(data), [data]);
  const selectedCells = useMemo(() => getCellsInRange(selection.start, selection.end), [selection]);

  const updateData = (cellId: string, value: string) => {
    const currentVal = data[cellId] || '';
    if (currentVal === value) return; // No change
    
    const newData = { ...data, [cellId]: value };
    if (value === '') {
      delete newData[cellId];
    }
    
    setHistory(prev => ({
      past: [...prev.past, prev.present],
      present: newData,
      future: []
    }));
  };

  const handleUndo = () => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, prev.past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future]
      };
    });
  };

  const handleRedo = () => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture
      };
    });
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  useEffect(() => {
    const stopSelecting = () => {
      isSelecting.current = false;
    };
    document.addEventListener('mouseup', stopSelecting);
    return () => document.removeEventListener('mouseup', stopSelecting);
  }, []);

  const startEditing = (cellId: string, initialValue?: string) => {
    setEditingCell(cellId);
    setEditValue(initialValue !== undefined ? initialValue : (data[cellId] || ''));
  };

  const finishEditing = () => {
    if (editingCell) {
      updateData(editingCell, editValue);
      setEditingCell(null);
    }
  };

  const setSelectionForCell = (cellId: string, keepRange = false) => {
    const newRange = keepRange
      ? { start: selection.start, end: cellId }
      : { start: cellId, end: cellId };
    if (!keepRange) {
      setActiveCell(cellId);
    }
    setSelection(newRange);
  };

  const getAutoRangeForCell = (targetCell: string) => {
    const cell = parseCell(targetCell);
    if (!cell) return null;

    if (cell.row > 0) {
      let startRow = cell.row - 1;
      while (startRow >= 0 && data[cellId(cell.col, startRow)]?.trim() !== '') {
        startRow -= 1;
      }
      if (startRow < cell.row - 1) {
        return `${cellId(cell.col, startRow + 1)}:${cellId(cell.col, cell.row - 1)}`;
      }
    }

    if (cell.col > 0) {
      let startCol = cell.col - 1;
      while (startCol >= 0 && data[cellId(startCol, cell.row)]?.trim() !== '') {
        startCol -= 1;
      }
      if (startCol < cell.col - 1) {
        return `${cellId(startCol + 1, cell.row)}:${cellId(cell.col - 1, cell.row)}`;
      }
    }

    return null;
  };

  const getFormulaRangeForTarget = (targetCell: string) => {
    const normalized = normalizeRange(selection.start, selection.end);
    if (normalized.start === normalized.end) {
      return getAutoRangeForCell(targetCell) ?? normalized.start;
    }

    const startCoord = parseCell(normalized.start);
    const endCoord = parseCell(normalized.end);
    const targetCoord = parseCell(targetCell);
    if (!startCoord || !endCoord || !targetCoord) {
      return normalized.start;
    }

    let sCol = startCoord.col;
    let eCol = endCoord.col;
    let sRow = startCoord.row;
    let eRow = endCoord.row;

    if (targetCoord.col === eCol && eCol > sCol) {
      eCol -= 1;
    } else if (targetCoord.col === sCol && sCol < eCol) {
      sCol += 1;
    } else if (targetCoord.row === eRow && eRow > sRow) {
      eRow -= 1;
    } else if (targetCoord.row === sRow && sRow < eRow) {
      sRow += 1;
    }

    const range = formatRange(cellId(sCol, sRow), cellId(eCol, eRow));
    return range === targetCell ? getAutoRangeForCell(targetCell) ?? targetCell : range;
  };

  const handleKeyDown = (e: React.KeyboardEvent, cellId: string) => {
    if (editingCell) {
      if (e.key === 'Enter') {
        finishEditing();
        const match = cellId.match(/([A-J])(10|[1-9])/);
        if (match) {
          const col = match[1];
          const row = parseInt(match[2], 10);
          if (row < 10) {
            setSelectionForCell(`${col}${row + 1}`);
          }
        }
      } else if (e.key === 'Escape') {
        setEditingCell(null);
      }
      return;
    }

    if (e.key === 'Enter') {
      startEditing(cellId);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      updateData(cellId, '');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startEditing(cellId, e.key);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const match = cellId.match(/([A-J])(10|[1-9])/);
      if (!match) return;
      const colIdx = COLS.indexOf(match[1]);
      const rowIdx = ROWS.indexOf(parseInt(match[2], 10));
      let nextCol = colIdx;
      let nextRow = rowIdx;
      if (e.key === 'ArrowUp') nextRow = Math.max(0, rowIdx - 1);
      if (e.key === 'ArrowDown') nextRow = Math.min(ROWS.length - 1, rowIdx + 1);
      if (e.key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
      if (e.key === 'ArrowRight') nextCol = Math.min(COLS.length - 1, colIdx + 1);
      const nextCell = `${COLS[nextCol]}${ROWS[nextRow]}`;
      setSelectionForCell(nextCell);
    }
  };

  const getFormulaBarValue = () => {
    if (editingCell) return editValue;
    if (activeCell) return data[activeCell] || '';
    return '';
  };

  const handleFormulaBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeCell) return;
    if (!editingCell) setEditingCell(activeCell);
    setEditValue(e.target.value);
  };

  const handleFormulaBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      finishEditing();
    }
  };

  const injectFunction = (funcName: string) => {
    const rangeRef = getFormulaRangeForTarget(activeCell);
    if (rangeRef === activeCell) {
      const auto = getAutoRangeForCell(activeCell);
      if (!auto) return;
      setEditValue(`=${funcName}(${auto})`);
      startEditing(activeCell);
      return;
    }
    startEditing(activeCell);
    setEditValue(`=${funcName}(${rangeRef})`);
  };

  return (
    <div className="app-wrapper">
      <div className="sheet-menu-bar">
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Insert</span>
        <span>Format</span>
        <span>Data</span>
      </div>

      <div className="sheet-heading">
        <h1 className="title">Spreadsheet</h1>
        <p className="subtitle">Select cells, edit formulas, and use basic functions like SUM and AVG.</p>
      </div>

      <div className="top-bar">
        <div className="formula-bar">
          <Equal size={20} className="formula-icon" />
          <input
            type="text"
            className="formula-input"
            value={getFormulaBarValue()}
            onChange={handleFormulaBarChange}
            onKeyDown={handleFormulaBarKeyDown}
            onFocus={() => {
              if (activeCell && !editingCell) startEditing(activeCell);
            }}
            placeholder="Select a cell or enter a value/formula..."
          />
        </div>

        <div className="toolbar">
          <button
            className="btn"
            onClick={() => injectFunction('sum')}
            title="SUM"
          >
            SUM
          </button>
          <button
            className="btn"
            onClick={() => injectFunction('average')}
            title="AVERAGE"
          >
            AVG
          </button>
          <button
            className="btn"
            onClick={() => injectFunction('min')}
            title="MIN"
          >
            MIN
          </button>
          <button
            className="btn"
            onClick={() => injectFunction('max')}
            title="MAX"
          >
            MAX
          </button>
          <button
            className="btn"
            onClick={() => injectFunction('count')}
            title="COUNT"
          >
            CNT
          </button>
          <button
            className="btn"
            onClick={handleUndo}
            disabled={history.past.length === 0}
            title="Undo"
          >
            <Undo size={18} />
            Undo
          </button>
          <button
            className="btn"
            onClick={handleRedo}
            disabled={history.future.length === 0}
            title="Redo"
          >
            <Redo size={18} />
            Redo
          </button>
        </div>
      </div>

      <div className="spreadsheet-container">
        <div className="grid">
          {/* Corner cell */}
          <div className="cell corner"></div>
          
          {/* Column headers */}
          {COLS.map(col => (
            <div key={col} className="cell header">{col}</div>
          ))}

          {/* Rows */}
          {ROWS.map(row => (
            <React.Fragment key={row}>
              {/* Row header */}
              <div className="cell header">{row}</div>
              
              {/* Data cells */}
              {COLS.map(col => {
                const cellId = `${col}${row}`;
                const isEditing = editingCell === cellId;
                const isActive = activeCell === cellId;
                const isSelected = selectedCells.has(cellId);
                const computedVal = computedData[cellId];
                
                let displayVal: string | number = '';
                let extraClass = '';
                
                if (computedVal === '#ERROR') {
                  displayVal = '#ERROR';
                  extraClass = 'error-text';
                } else if (computedVal === '#CIRCULAR') {
                  displayVal = '#CIRCULAR';
                  extraClass = 'circular-text';
                } else if (computedVal !== undefined) {
                  displayVal = computedVal;
                }

                return (
                  <div
                    key={cellId}
                    className={`cell data-cell ${isSelected ? 'selected' : ''} ${isActive ? 'active-cell' : ''}`}
                    title={isEditing ? '' : String(displayVal)}
                    onMouseDown={() => {
                      finishEditing();
                      isSelecting.current = true;
                      setSelectionForCell(cellId);
                    }}
                    onMouseEnter={() => {
                      if (isSelecting.current) {
                        setSelectionForCell(cellId, true);
                      }
                    }}
                    onClick={() => {
                      if (!isEditing) {
                        finishEditing();
                        setSelectionForCell(cellId);
                      }
                    }}
                    onDoubleClick={() => startEditing(cellId)}
                    tabIndex={0}
                    onKeyDown={e => handleKeyDown(e, cellId)}
                    onDragStart={e => e.preventDefault()}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="cell-input"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={finishEditing}
                      />
                    ) : (
                      <span className={extraClass}>{displayVal}</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
