ENTRY_ID_LABEL = '_id';
var data;
var hot;
var colHeaders;
// Queue for operations to be sent to server
var queue = [];


var $contents = $('#contents');
var $sourceContents = $('#source-contents');
var $dataSources = $('#data-sources > tbody');
var $usersContents = $('#users');
var $tableContents;
var $settings = $('form[data-settings]');
var $noResults = $('.no-results-found');

var organizationId = Fliplet.Env.get('organizationId');
var currentDataSource;
var currentDataSourceId;
var currentEditor;
var dataSources;

var dataSourceEntriesHasChanged = false;

var tinyMCEConfiguration = {
  menubar: false,
  statusbar: false,
  inline: true,
  valid_elements : "tr,th,td[colspan|rowspan],thead,tbody,table,tfoot",
  valid_styles: {},
  plugins: "paste, table",
  gecko_spellcheck: true,
  toolbar: 'undo redo | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol',
  contextmenu: "tableprops | cell row column",
  table_toolbar: "",
  object_resizing: false,
  paste_auto_cleanup_on_paste : false,
  paste_remove_styles: true,
  paste_remove_styles_if_webkit: true,
  setup: function (editor) {
    editor.on('change paste cut', function(e) {
      dataSourceEntriesHasChanged = true;
      $('[data-save]').removeClass('disabled');
    });
  }
};

// Fetch all data sources
function getDataSources() {
  if (tinymce.editors.length) {
    tinymce.editors[0].remove();
  }

  $contents.removeClass('hidden');
  $sourceContents.addClass('hidden');
  $('[data-save]').addClass('disabled');

  // If we already have data sources no need to go further.
  if (dataSources) {
    return;
  }

  Fliplet.DataSources.get({ roles: 'publisher,editor', type: null })
    .then(function onGetDataSources(userDataSources) {
      dataSources = userDataSources;
      $dataSources.empty();
      dataSources.forEach(renderDataSource);
    });
}

function fetchCurrentDataSourceDetails() {
  return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
    $settings.find('#id').html(dataSource.id);
    $settings.find('[name="name"]').val(dataSource.name);
    if (!dataSource.bundle) {
      $('#bundle').prop('checked', true);
    }
    if (dataSource.definition) {
      $('#definition').val(JSON.stringify(dataSource.definition, null, 2));
    }
  });
}

function fetchCurrentDataSourceUsers() {
  return Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    source.getUsers().then(function (users) {
      var tpl = Fliplet.Widget.Templates['templates.users'];
      var html = tpl({ users: users });
      $usersContents.html(html);
    });
  });
}

function fetchCurrentDataSourceEntries() {
  var columns;

  return Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    currentDataSource = source;
    return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {

      colHeaders = dataSource.columns;
      colHeaders.unshift(ENTRY_ID_LABEL);

      return source.find({});
    });
  }).then(function (rows) {
    if (!rows) {
      colHeaders = ['id', 'name'];
    }

    // Data has an object
    data = rows.map(function(row) {
      row.data[ENTRY_ID_LABEL] = row.id;
      return row.data;
    });

    // Don't bind data to data source object
    // Data as an array
    data = data.map(function(row) {
      return colHeaders.map(function(header){
        return row[header];
      });
    });

    // Arrange order of table accordingly to order of columns
    // Not used for now.
    var columns = colHeaders.map(function(header) {
      return { data: header };
    });

    /*
     * Render custom header. With an input field so we can edit the header
     * Using this we need to make sure to update headers accordingly.
     */
    var customColHeaders = function (index) {
      return colHeaders[index] === ENTRY_ID_LABEL
        ? colHeaders[index]
        : '<input class="input-header" type="text" value="' + colHeaders[index] + '" /> ⇵';
    };

    function updateColHeaders() {
      colHeaders = getColHeaders();
      hot.updateSettings({
        colHeaders: customColHeaders
      });
    }

    function getColHeaders() {
      var headers = [];
      $('.ht_clone_top .input-header').each(function(index, el) {
        var header = $(el).val();
        if (headers.indexOf(header) > -1) {
          header = header + ' (1)';
        }

        headers.push(header);
      });

      return headers;
    }

    function updateQueueRows(options) {
      if (options.action === 'remove') {
        // Remove any operation from this row
        queue = queue
          .filter(function (operation) {
            return operation.row < index || operation.row > index + amount;
          })
          .map(function (operation) {
            if (operation.row > index) {
              operation.row = operation.row - amount;
            }

            return operation;
          });
      }
    }

    /*
     * Might be needed to do other stuff here
     */
    function enqueueOperation(operation) {
      /*
       row:3
       type: insert
       data: blah

       data: blah
       row:3
       type: insert

       */
      if (operation.type === 'update') {
        var found = false;
        for (var i = 0; i < queue.length; i++) {
          if (queue[i].dataSourceEntryId === operation.dataSourceEntryId) {
            found = true;
            queue[i].data = $.extend(queue[i].data, operation.data);
            queue[i].type = operation.type;
          }
        }
      }

      if (operation.type === 'insert') {
        for (var i = 0; i < queue.length; i++) {
          if (queue[i].row === operation.row) {
            queue[i].data = $.extend(queue[i].data, operation.data);
            queue[i].type = operation.type;
            return;
          }
        }
      }

      if (operation.type == 'delete' && operation.dataSourceEntryId) {
        for (var i = 0; i < queue.length; i++) {
          if (queue[i].dataSourceEntryId === operation.dataSourceEntryId) {
            delete queue[i].data;
            queue[i].type = operation.type;
            return;
          }
        }
      }

      if (operation.type == 'delete' && !operation.dataSourceEntryId) {
        for (var i = 0; i < queue.length; i++) {
          if (queue[i].row === operation.row) {
            queue.splice(i,1);
            return;
          }
        }
      }

      if (!found) {
        queue.push(operation);
      }
    }

    var options = {
      data: data,
      contextMenu: true,
      // Always have one empty row at the end
      minSpareRows: 2,
      manualColumnMove: true,
      columnSorting: true,
      sortIndicator: true,
      colHeaders: customColHeaders,
      // columns: columns, We can't use this for now as this set max cols
      rowHeaders: false,
      // Hooks
      afterColumnMove: function (columns, target) {
        updateColHeaders();

        console.log({colHeaders});
      },
      afterChange: function(changes, source) {
        console.log({changes, source});
        // If it was an edit or redo
        if (['edit','UndoRedo.undo','CopyPaste.paste'].indexOf(source) > -1) {
          // Create operations
          changes.forEach(function(change) {
            // Get entry id
            var entryId = hot.getDataAtRowProp(change[0],colHeaders.indexOf(ENTRY_ID_LABEL));

            var operation = {
              row: change[0],
              oldVal: change[1],
              type: entryId ? 'update' : 'insert',
              data: {
                [colHeaders[change[1]]]: change[3]
              }
            };

            if (entryId) {
              operation.dataSourceEntryId = entryId;
            }

            // Push operation to queue
            enqueueOperation(operation);
          })
        }
      },
      beforeRemoveRow: function (index, amount) {
        console.log({index, amount});
        // Get entry id
        var entryId = hot.getDataAtRowProp(index,colHeaders.indexOf(ENTRY_ID_LABEL));
        console.log({entryId});
        // Create operation
        var operation = {
          type: 'delete',
          dataSourceEntryId: entryId,
          row: index
        };
        console.log({operation});
        // Push operation to queue
        enqueueOperation(operation);
      },
      afterCreateRow: function (index, amount) {
        updateQueueRows({
          index: index,
          amount: amount,
          action: 'create'
        });
        // Do nothing. We need to get data on change hook
        console.log({index, amount});
      }
    };

    hot = new Handsontable(document.getElementById('hot'), options);
  })
    .catch(function onFetchError(error) {
      console.log(error);
      $('.table-entries').html('<br>Access denied. Please review your security settings if you want to access this data source.');
    });
}

Fliplet.Widget.onSaveRequest(function () {
  saveCurrentData().then(Fliplet.Widget.complete);
});

function saveCurrentData() {
  if (!tinymce.editors.length) {
    return Promise.resolve();
  }

  var $table = $('<div>' + tinymce.editors[0].getContent() + '</div>');

  // Append the table to the dom so "tableToJSON" works fine
  $table.css('visibility', 'hidden');
  $('body').append($table)

  var tableRows = $table.find('table').tableToJSON();

  tableRows.forEach(function (row) {
    Object.keys(row).forEach(function (column) {
      var value = row[column];

      try {
        // Convert value to JSON data when necessary (arrays and objects)
        row[column] = JSON.parse(value);
      }
      catch (e) {
        // Convert value to number when necessary
        if (!isNaN(value) && !value.match(/^(\+|0)/)) {
          row[column] = parseFloat(value, 10)
        } else {
          // Convert value to boolean
          if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          }
        }
      }
    });
  });

  $('.table-entries').html('Saving...');

  return currentDataSource.replaceWith(tableRows);
}

// Append a data source to the DOM
function renderDataSource(data) {
  var tpl = Fliplet.Widget.Templates['templates.dataSource'];
  var html = tpl(data);
  $dataSources.append(html);
}

function windowResized() {
  $('.tab-content').height($('body').height() - $('.tab-content').offset().top);
  $('.table-entries').height($('.tab-content').height());
  $('#contents:visible').height($('body').height() - $('#contents').offset().top);
}

// events
$(window).on('resize', windowResized).trigger('resize');
$('#app')
  .on('click', '[data-back]', function (event) {
    event.preventDefault();

    if (!dataSourceEntriesHasChanged || confirm('Are you sure? Changes that you made may not be saved.')) {
      dataSourceEntriesHasChanged = false;
      getDataSources();
    }
  })
  .on('click', '[data-save]', function (event) {
    event.preventDefault();

    var saveData = dataSourceEntriesHasChanged ? saveCurrentData() : Promise.resolve();
    dataSourceEntriesHasChanged = false;

    saveData.then(function () {
      getDataSources();
    })
  })
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('.data-source').data('id');
    var name = $(this).closest('.data-source').find('.data-source-name').text();

    $contents.addClass('hidden');
    $('.table-entries').html('<br>Loading data...');
    $sourceContents.removeClass('hidden');
    $sourceContents.find('h1').html(name);
    windowResized();

    // Input file temporarily disabled
    // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

    Promise.all([
      fetchCurrentDataSourceEntries(),
      fetchCurrentDataSourceUsers(),
      fetchCurrentDataSourceDetails()
    ])
      .catch(function () {
        // Something went wrong
        // EG: User try to edit an already deleted data source
        // TODO: Show some error message
        getDataSources();
      });
  })
  .on('click', '[data-delete-source]', function (event) {
    event.preventDefault();
    if (!confirm('Are you sure you want to delete this data source? All entries will be deleted.')) {
      return;
    }

    Fliplet.DataSources.delete(currentDataSourceId).then(function () {
      // Remove from UI
      $('[data-id=' + currentDataSourceId + ']').remove();

      // Remove from dataSources
      dataSources = dataSources.filter(function(ds) {
        return ds.id !== currentDataSourceId;
      });

      // Go back
      $('[data-back]').click();
    });
  })
  .on('click', '[data-create-source]', function (event) {
    event.preventDefault();
    var sourceName = prompt('Please type the new table name:');

    if (!sourceName) {
      return;
    }

    Fliplet.Organizations.get().then(function (organizations) {
      return Fliplet.DataSources.create({
        organizationId: organizations[0].id,
        name: sourceName
      });
    }).then(function(createdDataSource){
      dataSources.push(createdDataSource);
      renderDataSource(createdDataSource);
    });
  })
  .on('change', 'input[type="file"]', function (event) {
    var $input = $(this);
    var file = $input[0].files[0];
    var formData = new FormData();

    formData.append('file', file);

    currentDataSource.import(formData).then(function (files) {
      $input.val('');
      fetchCurrentDataSourceEntries();
    });
  })
  .on('click', '[data-create-role]', function (event) {
    event.preventDefault();
    var userId = prompt('User ID');
    var permissions = prompt('Permissions', 'crudq');

    if (!userId || !permissions) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
      return source.addUserRole({
        userId: userId,
        permissions: permissions
      });
    }).then(fetchCurrentDataSourceUsers, function (err) {
      alert(err.responseJSON.message);
    });
  })
  .on('click', '[data-revoke-role]', function (event) {
    event.preventDefault();
    var userId = $(this).data('revoke-role');

    if (!confirm('Are you sure you want to revoke this role?')) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
      return source.removeUserRole(userId);
    }).then(function () {
      fetchCurrentDataSourceUsers();
    });
  })
  .on('submit', 'form[data-settings]', function (event) {
    event.preventDefault();
    var name = $settings.find('#name').val();
    var bundle = !$('#bundle').is(':checked');
    var definition = $settings.find('#definition').val();
    if (!name) {
      return;
    }

    try {
      definition = JSON.parse(definition);
    } catch (e) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid settings',
        popupMessage: 'Definition MUST be a valid JSON'
      });
      return;
    }

    Fliplet.DataSources.update({
      id: currentDataSourceId,
      name: name,
      bundle: bundle,
      definition: definition
    })
      .then(function () {
        $('[data-back]').click();
      });
  })
  .on('click', '#cancel', function () {
    $('[data-back]').click();
  })
  .on('keyup change paste', '.search', function () {
    var term = new RegExp(this.value, "i");
    $noResults.removeClass('show');

    var search = dataSources.filter(function (dataSource) {
      return dataSource.name.match(term);
    });

    $dataSources.empty();
    if (search.length === 0 && dataSources.length) {
      $noResults.addClass('show');
    }
    search.forEach(renderDataSource);
  });

// Fetch data sources when the provider starts
getDataSources();
