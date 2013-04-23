const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;

const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const WindowManager = imports.ui.windowManager;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;

/**********/
/* CONFIG */
/**********/
const workspaceCols = 4;
const workspaceRows = 2; 
const workspaceLoop = true;

/*******************/
/* WORKSPACE POPUP */
/*******************/
const SwitcherPopup = new Lang.Class({
    Name: 'SwitcherPopup',
    Extends:  WorkspaceSwitcherPopup.WorkspaceSwitcherPopup,

    _getPreferredHeight : function (actor, forWidth, alloc) {
        let children = this._list.get_children();
        let primary = Main.layoutManager.primaryMonitor;

        let availHeight = primary.height;
        availHeight -= Main.panel.actor.height;
        availHeight -= bottomPanel.actor.height;
        availHeight -= this.actor.get_theme_node().get_vertical_padding();
        availHeight -= this._container.get_theme_node().get_vertical_padding();
        availHeight -= this._list.get_theme_node().get_vertical_padding();

        let [childMinHeight, childNaturalHeight] = children[0].get_preferred_height(-1);

        let height = nrows * childNaturalHeight;

        let spacing = this._itemSpacing * (nrows - 1);
        height += spacing;
        height = Math.min(height, availHeight);

        this._childHeight = (height - spacing) / nrows;

        alloc.min_size = height;
        alloc.natural_size = height;
    },

    _getPreferredWidth : function (actor, forHeight, alloc) {
        let children = this._list.get_children();
        let primary = Main.layoutManager.primaryMonitor;

        let availWidth = primary.width;
        availWidth -= this.actor.get_theme_node().get_horizontal_padding();
        availWidth -= this._container.get_theme_node().get_horizontal_padding();
        availWidth -= this._list.get_theme_node().get_horizontal_padding();

        let ncols = get_ncols();

        let [childMinHeight, childNaturalHeight] = children[0].get_preferred_height(-1);
        let childNaturalWidth = childNaturalHeight * primary.width/primary.height;

        let width = ncols * childNaturalWidth;

        let spacing = this._itemSpacing * (ncols - 1);
        width += spacing;
        width = Math.min(width, availWidth);

        this._childWidth = (width - spacing) / ncols;

        alloc.min_size = width;
        alloc.natural_size = width;
    },

    _allocate : function (actor, box, flags) {
        let children = this._list.get_children();
        let childBox = new Clutter.ActorBox();

        let ncols = get_ncols();

        for ( let ir=0; ir<nrows; ++ir ) {
            for ( let ic=0; ic<ncols; ++ic ) {
                let i = ncols*ir + ic;
                let x = box.x1 + ic * (this._childWidth + this._itemSpacing);
                childBox.x1 = x;
                childBox.x2 = x + this._childWidth;
                let y = box.y1 + ir * (this._childHeight + this._itemSpacing);
                childBox.y1 = y;
                childBox.y2 = y + this._childHeight;
                children[i].allocate(childBox, flags);
            }
        }
    },

    _redraw : function(direction, activeWorkspaceIndex) {
        this._list.destroy_all_children();

        for (let i = 0; i < global.screen.n_workspaces; i++) {
            let indicator = null;

           if (i == activeWorkspaceIndex && direction == Meta.MotionDirection.LEFT)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-left' });
           else if (i == activeWorkspaceIndex && direction == Meta.MotionDirection.RIGHT)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-right' });
           else if (i == activeWorkspaceIndex && direction == Meta.MotionDirection.UP)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-up' });
           else if(i == activeWorkspaceIndex && direction == Meta.MotionDirection.DOWN)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-down' });
           else
               indicator = new St.Bin({ style_class: 'ws-switcher-box' });

           this._list.add_actor(indicator);

        }
    },

    display : function(direction, activeWorkspaceIndex) {
        this._redraw(direction, activeWorkspaceIndex);
        if (this._timeoutId != 0)
            Mainloop.source_remove(this._timeoutId);
        this._timeoutId = Mainloop.timeout_add(500, Lang.bind(this, this._onTimeout));
        this._show();
    }
});


/***************************/
/* WORKSPACE GRID HANDLING */
/***************************/
function myGet_neighbor(direction) {
	var index = this.index();
	
    if(workspaceLoop) {
	    if(direction === Meta.MotionDirection.UP) {
            index = (index+(workspaceCols*workspaceRows)-workspaceCols)%(workspaceCols*workspaceRows);
	    } else if(direction === Meta.MotionDirection.DOWN) {
	        index = (index+workspaceCols)%(workspaceCols*workspaceRows);
	    } else if(direction === Meta.MotionDirection.LEFT) {
            if(index%workspaceCols == 0)
                index = index-1+workspaceCols;
            else
                index = index-1;
	        
	    } else if(direction === Meta.MotionDirection.RIGHT) {
            if(index%workspaceCols == workspaceCols-1)
                index = index+1-workspaceCols;
            else
                index = index+1;
	    }
	} else {
	    /* Gnome does it correctly, even in grid mode */
	    if(direction === Meta.MotionDirection.UP) {
            if(index>=workspaceCols) index = index-workspaceCols;
	    } else if(direction === Meta.MotionDirection.DOWN) {
	        if(index<(workspaceCols*(workspaceRows-1))) index = index+workspaceCols;
	    } else if(direction === Meta.MotionDirection.LEFT) {
            if(index%workspaceCols != 0) index = index-1;
	    } else if(direction === Meta.MotionDirection.RIGHT) {
            if(index%workspaceCols != workspaceCols-1) index = index+1;
	    }
	}
		
	return global.screen.get_workspace_by_index(index);
}

function myShowWorkspaceSwitcher(display, screen, window, binding) {
    let [action,,,direction] = binding.get_name().split('-');
    let direction = Meta.MotionDirection[direction.toUpperCase()];
    let newWs;

    if (action == 'switch') {
        newWs = this.actionMoveWorkspace(direction);
    } else {
        newWs = this.actionMoveWindow(window, direction);
    }
    
    if (!Main.overview.visible) {
        if (this._workspaceSwitcherPopup == null) {
            this._workspaceSwitcherPopup = new SwitcherPopup();
            this._workspaceSwitcherPopup.connect('destroy',
                Lang.bind(this, function() {
                    this._workspaceSwitcherPopup = null;
                }));
        }
        this._workspaceSwitcherPopup.display(direction, newWs.index());
    }
}


/************************/
/* INITIALIZATION STUFF */
/************************/
let origGet_neighbor, origShowWorkspaceSwitcher, origWorkspaceNumber;
function init() {
	origGet_neighbor = Meta.Workspace.prototype.get_neighbor;
    WindowManager.WindowManager.prototype._reset = function() {
        Meta.keybindings_set_custom_handler('switch-to-workspace-left',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-right',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-up',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-down',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-left',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-right',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-up',
                    Lang.bind(this, this._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-down',
                    Lang.bind(this, this._showWorkspaceSwitcher));

        this._workspaceSwitcherPopup = null;
    };
	origShowWorkspaceSwitcher = WindowManager.WindowManager.prototype._showWorkspaceSwitcher;
}

function setWorkspacesNumber(number) {
    if(global.screen.n_workspaces != number) {
        if(global.screen.n_workspaces < number) {
            while(global.screen.n_workspaces < number)
                global.screen.append_new_workspace(false, global.get_current_time());
        } else {
            for(let i=global.screen.n_workspaces-1; i>=number; i--)
                global.screen.remove_workspace(global.screen.get_workspace_by_index(i), global.get_current_time());
        }
    }
}

function enable() {
	Meta.Workspace.prototype.get_neighbor = myGet_neighbor;
    WindowManager.WindowManager.prototype._showWorkspaceSwitcher = myShowWorkspaceSwitcher;
    origWorkspaceNumber = global.screen.n_workspaces;
    setWorkspacesNumber(workspaceRows*workspaceCols);

    /* Go in grid layout ! It's funny because GNOME actually does this. */
    global.screen.override_workspace_layout(Meta.ScreenCorner.TOPLEFT, false, workspaceRows, workspaceCols);
    
    Main.wm._reset();
}

function disable() {
	Meta.Workspace.prototype.get_neighbor = origGet_neighbor;
    WindowManager.WindowManager.prototype._showWorkspaceSwitcher = origShowWorkspaceSwitcher;
    setWorkspacesNumber(origWorkspaceNumber);
    global.screen.override_workspace_layout(Meta.ScreenCorner.TOPLEFT, false, -1, 1);

    Main.wm._reset();
}
