/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Selections } from '@ephox/darwin';
import { Arr, Fun } from '@ephox/katamari';
import { TableLookup, Warehouse } from '@ephox/snooker';
import { Compare, SugarElement } from '@ephox/sugar';
import Editor from 'tinymce/core/api/Editor';
import { Dialog } from 'tinymce/core/api/ui/Ui';
import * as Styles from '../actions/Styles';
import { hasAdvancedCellTab } from '../api/Settings';
import * as Util from '../core/Util';
import * as TableSelection from '../selection/TableSelection';
import * as CellDialogGeneralTab from './CellDialogGeneralTab';
import { DomModifier } from './DomModifier';
import * as Helpers from './Helpers';

type CellData = Helpers.CellData;

const getSelectedCells = (warehouse: Warehouse, cells: SugarElement<HTMLTableCellElement>[]) => {
  const allCells = Warehouse.justCells(warehouse);

  return Arr.filter(allCells, (cellA) =>
    Arr.exists(cells, (cellB) =>
      Compare.eq(cellA.element, cellB)
    )
  );
};

const updateSimpleProps = (editor: Editor, modifier: DomModifier, isSingleCell: boolean, column: SugarElement<HTMLElement> | undefined, data: CellData) => {
  modifier.setAttrib('scope', data.scope);
  modifier.setAttrib('class', data.class);
  modifier.setStyle('height', Util.addPxSuffix(data.height));
  if (column) {
    const columnModifier = isSingleCell ? DomModifier.normal(editor, column.dom) : DomModifier.ifTruthy(editor, column.dom);
    columnModifier.setStyle('width', Util.addPxSuffix(data.width));
  } else {
    modifier.setStyle('width', Util.addPxSuffix(data.width));
  }
};

const updateAdvancedProps = (modifier: DomModifier, data: CellData) => {
  modifier.setFormat('tablecellbackgroundcolor', data.backgroundcolor);
  modifier.setFormat('tablecellbordercolor', data.bordercolor);
  modifier.setFormat('tablecellborderstyle', data.borderstyle);
  modifier.setFormat('tablecellborderwidth', Util.addPxSuffix(data.borderwidth));
};

// NOTES:

// When applying to a single cell, values can be falsy. That is
// because there should be a consistent value across the cell
// selection, so it should also be possible to toggle things off.

// When applying to multiple cells, values must be truthy to be set.
// This is because multiple cells might have different values, and you
// don't want a blank value to wipe out their original values. Note,
// how as part of this, it doesn't remove any original alignment before
// applying any specified alignment.

const applyCellData = (editor: Editor, cells: SugarElement<HTMLTableCellElement>[], data: CellData) => {
  const dom = editor.dom;
  const isSingleCell = cells.length === 1;

  if (cells.length >= 1) {
    const table = TableLookup.table(SugarElement.fromDom(cells[0].dom)).getOrNull();

    if (table) {
      const warehouse = Warehouse.fromTable(table);

      const selectedCells = getSelectedCells(warehouse, cells);

      Arr.each(selectedCells, (cell) => {
        // Switch cell type if applicable
        const cellElement = cell.element.dom;
        const cellElm = data.celltype && Util.getNodeName(cellElement) !== data.celltype ? (dom.rename(cellElement, data.celltype) as HTMLTableCellElement) : cellElement;
        const modifier = isSingleCell ? DomModifier.normal(editor, cellElm) : DomModifier.ifTruthy(editor, cellElm);

        const column = Warehouse.getColumnAtIndex(warehouse, cell.column);

        updateSimpleProps(editor, modifier, isSingleCell, column ? column.element : undefined, data);

        if (hasAdvancedCellTab(editor)) {
          updateAdvancedProps(modifier, data);
        }

        // Remove alignment
        if (isSingleCell) {
          Styles.unApplyAlign(editor, cellElm);
          Styles.unApplyVAlign(editor, cellElm);
        }

        // Apply alignment
        if (data.halign) {
          Styles.applyAlign(editor, cellElm, data.halign);
        }

        // Apply vertical alignment
        if (data.valign) {
          Styles.applyVAlign(editor, cellElm, data.valign);
        }
      });
    }
  }
};

const onSubmitCellForm = (editor: Editor, cells: SugarElement<HTMLTableCellElement>[], api) => {
  const data: CellData = api.getData();
  api.close();

  editor.undoManager.transact(() => {
    applyCellData(editor, cells, data);
    editor.focus();
  });
};

const getData = (editor: Editor, startCell: SugarElement<Element>, cells: SugarElement<HTMLTableCellElement>[]) => {
  const table = TableLookup.table(startCell).getOrNull();

  const warehouse = Warehouse.fromTable(table);

  const selectedCells = getSelectedCells(warehouse, cells);

  const cellsData: CellData[] = Arr.map(selectedCells, (cell) => {
    const column = Warehouse.getColumnAtIndex(warehouse, cell.column);

    return Helpers.extractDataFromCellElement(editor, cell.element.dom, column ? column.element : undefined, hasAdvancedCellTab(editor));
  });

  return Helpers.getSharedValues<CellData>(cellsData);
};

const open = (editor: Editor, selections: Selections) => {
  const cell = Util.getSelectionStart(editor);
  const cells = TableSelection.getCellsFromSelection(Util.getSelectionStart(editor), selections);

  // Check if there are any cells to operate on
  if (cells.length === 0) {
    return;
  }

  const data = getData(editor, cell, cells);

  const dialogTabPanel: Dialog.TabPanelSpec = {
    type: 'tabpanel',
    tabs: [
      {
        title: 'General',
        name: 'general',
        items: CellDialogGeneralTab.getItems(editor)
      },
      Helpers.getAdvancedTab('cell')
    ]
  };
  const dialogPanel: Dialog.PanelSpec = {
    type: 'panel',
    items: [
      {
        type: 'grid',
        columns: 2,
        items: CellDialogGeneralTab.getItems(editor)
      }
    ]
  };
  editor.windowManager.open({
    title: 'Cell Properties',
    size: 'normal',
    body: hasAdvancedCellTab(editor) ? dialogTabPanel : dialogPanel,
    buttons: [
      {
        type: 'cancel',
        name: 'cancel',
        text: 'Cancel'
      },
      {
        type: 'submit',
        name: 'save',
        text: 'Save',
        primary: true
      }
    ],
    initialData: data,
    onSubmit: Fun.curry(onSubmitCellForm, editor, cells)
  });
};

export { open };

