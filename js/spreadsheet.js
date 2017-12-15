var hot, 
    data, 
    hotSelection; // Stores current selection to use for toolbar
          
var spreadsheet = function(options) {
  ENTRY_ID_LABEL = 'ID';
  var rows = options.rows || [];
  var columns = options.columns || [];
  var connection = options.connection;
  var dataLoaded = false;
  var columnNameCounter = 0; // Counter to anonymous columns names
  

  // Don't bind data to data source object
  // Data as an array
  data = rows.map(function(row) {
    var dataRow = columns.map(function(header, index) {
      return row.data[header];
    });
    dataRow.id = row.id;
    return dataRow;
  });

  // Add columns as first row
  data.unshift(columns);

  function onChanges() {
    if (dataLoaded) {
      dataSourceEntriesHasChanged = true;
      $('[data-save]').removeClass('disabled');
    }
  }

  /**
   * Style firt row. First row is the columns names
   */
  function columnValueRenderer(instance, td, row, col, prop, value, cellProperties) {
    var escaped = Handsontable.helper.stringify(value);
    td.innerHTML = escaped;
    $(td).css({
      'font-weight': 'bold',
      'background-color': '#e4e4e4'
    });
  }

  var hotSettings = {
    stretchH: 'all',
    manualColumnResize: true,
    manualColumnMove: true,
    minColsNumber: 1,
    minRowsNumber: 100,
    fixedRowsTop: 1,
    colHeaders: true,
    rowHeaders: true,
    columnSorting: true,
    sortIndicator: true,
    sortFunction: function(sortOrder, columnMeta) {
    	return function(a, b) {
      	var plugin = hot.getPlugin('columnSorting');
        var sortFunction;
        
        if (a[0] === 0) {
        	return -1;
        }
        
        switch (columnMeta.type) {
          case 'date':
            sortFunction = plugin.dateSort;
            break;
          case 'numeric':
            sortFunction = plugin.numericSort;
            break;
          default:
            sortFunction = plugin.defaultSort;
        }
      	
        return sortFunction(sortOrder, columnMeta)(a, b);
      };
    },
    cells: function (row, col, prop) {
      var cellProperties = {};
      
      if (row === 0) {
        cellProperties.renderer = columnValueRenderer;
      }

      return cellProperties;
    },
    contextMenu: ['row_above', 'row_below', 'remove_row', 'col_left', 'col_right', 'remove_col', 'undo', 'redo'],
    data: data,
    // Always have one empty row at the end
    minSpareRows: 100,
    // Hooks
    beforeChange: function(changes, source) {
      var headers = getColumns();
      // Check if the change was on columns row and validate
      changes.forEach(function(change) {
        if (change[0] === 0) {
          if (change[3] === '') {
            change[3] = generateColumnName();
          }
    
          if (headers.indexOf(change[3]) > -1) {
            change[3] = fixColumnName(change[3]);
          }
        }
      });

      onChanges();
    },
    afterCreateRow: function(index, amount) {
      onChanges();
    },
    afterRemoveRow: function(index, amount) {
      onChanges();
    },
    afterCreateCol: function(index, amount, source) {
      for (var i = 0; i < amount; i++) {
        var columnName = generateColumnName();
        hot.setDataAtCell(0, index + i, columnName);
      }

      onChanges();
    },
    beforeRemoveCol: function(index, amount) {
    },
    afterRemoveCol: function(index, amount) {
      onChanges();
    },
    afterLoadData: function(firstTime) {
      dataLoaded = true;
      $('.entries-message').html('');
    },
    afterSelectionEnd: function(r, c, r2, c2) {
      hotSelection = [r, c, r2, c2];
    }
  };
  
  hot = new Handsontable(document.getElementById('hot'), hotSettings);

  function getColumns() {
    var random = (new Date()).getTime().toString().slice(10);
    var headers = [];
    var dataAtRow0 = hot.getDataAtRow(0);

    // At this point columns should all have name
    // But just in case
    dataAtRow0.forEach(function(header, index) {
      if (header === '') {
        header = generateColumnName();
      }

      if (headers.indexOf(header) > -1) {
        header = header + ' (1)'
      }
      
      headers.push(header);
    });
    
    return headers;
  }

  /**
   * Generates a column name in the form 
   * Column 1, Column 2, and so on...
   */
  function generateColumnName() {
    var headers = getColumns();
    columnNameCounter = columnNameCounter + 1;
    var columnName = 'Column '+ columnNameCounter;
    return headers.indexOf(columnName) > -1
    ? generateColumnName()
    : columnName;
  }

  /**
   * Fixes column name for the user
   * There can't be duplicated column names
   */
  function fixColumnName(name, j) {
    var j = j + 1 || 1;
    var headers = getColumns();
    var columnName = name + '(' + j + ')';
    return headers.indexOf(columnName) > -1
    ? fixColumnName(name, j)
    : columnName;
  }

  return {
    getData: function() {
      var headers = getColumns();
      var entries = [];
      // Remove columns row
      var tableData = data.slice(1);

      tableData.forEach(function(row, index) {
        var entry = { id: row.id, data: {} };
        var emptyRow = true;

        headers.forEach(function(header, index) {
          if (row[index]) {
            emptyRow = false;
          }
          entry.data[header] = row[index];
        });

        if (!emptyRow) {
          entries.push(entry);
        }
      });

      return entries;
    },
    getColumns: function() {
      return getColumns();
    },
    destroy: function() {
      return hot.destroy();
    }
  }
};

  // Toolbar Feature hotSelection sturcture: [r, c, r2, c2];
  // TODO:
  // - UI
  // - Decide what to do on the paste functionality  
  $("#toolbar")
    .on('click', '.insert-row-before', function(e) {
      hot.alter('insert_row', hotSelection[2], 1, 'Toolbar.rowBefore');
    })
    .on('click', '.insert-row-after', function() {
      hot.alter('insert_row', hotSelection[2]+1, 1, 'Toolbar.rowAfter');
    })
    .on('click', '.insert-column-right', function() {
      hot.alter('insert_col', hotSelection[3], 1, 'Toolbar.columnLeft');
    })
    .on('click', '.insert-column-left', function() {
      hot.alter('insert_col', hotSelection[3]+1, 1, 'Toolbar.columnRight');
    })
    .on('click', '.remove-row', function() {
      hot.alter('remove_row', hotSelection[2], 1, 'Toolbar.removeRow');
    })
    .on('click', '.remove-column', function() {
      hot.alter('remove_col', hotSelection[3], 1, 'Toolbar.removeColumn');
    })
    .on('click', '.redo', function() {
      hot.redo();
    })
    .on('click', '.undo', function() {
      hot.undo();
    })
    .on('click', '.copy', function() {
      var text = hot.getCopyableText(hotSelection[0], hotSelection[1], hotSelection[2], hotSelection[3]);
      copy(text);
    })
    .on('click', '.paste', function() {
      // TODO:
      var plugin = hot.getPlugin('copyPaste');
      plugin.paste;
    })
