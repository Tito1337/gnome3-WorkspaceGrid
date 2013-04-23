const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
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
const ANIMATION_TIME = 0.1;
const DISPLAY_TIMEOUT = 600;

const MyWorkspaceSwitcherPopup = new Lang.Class({
    Name: 'MyWorkspaceSwitcherPopup',
    Extends:  WorkspaceSwitcherPopup.WorkspaceSwitcherPopup,
    _redisplay: function() {
        this._list.destroy_all_children();

        for (let i = 0; i < global.screen.n_workspaces; i++) {
            let indicator = null;

           if (i == this._activeWorkspaceIndex)
               indicator = new St.Bin({ style_class: 'ws-switcher-active' });
           else
               indicator = new St.Bin({ style_class: 'ws-switcher-box' });

           this._list.add_actor(indicator);

        }

        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let [containerMinHeight, containerNatHeight] = this._container.get_preferred_height(global.screen_width);
        let [containerMinWidth, containerNatWidth] = this._container.get_preferred_width(containerNatHeight);
        this._container.x = workArea.x + Math.floor((workArea.width - containerNatWidth) / 2);
        this._container.y = workArea.y + Math.floor((workArea.height - containerNatHeight) / 2);
    },
    
    _getPreferredHeight : function (actor, forWidth, alloc) {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);

        let availHeight = workArea.height;
        availHeight -= this.actor.get_theme_node().get_vertical_padding();
        availHeight -= this._container.get_theme_node().get_vertical_padding();
        availHeight -= this._list.get_theme_node().get_vertical_padding();

        let spacing = this._itemSpacing * (workspaceRows - 1);
        let height = availHeight/3;

        this._childHeight = (height - spacing) / workspaceRows;

        alloc.min_size = height;
        alloc.natural_size = height;
    },
    
    _getPreferredWidth : function (actor, forHeight, alloc) {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let availWidth = workArea.width;
        availWidth -= this.actor.get_theme_node().get_horizontal_padding();
        availWidth -= this._container.get_theme_node().get_horizontal_padding();
        availWidth -= this._list.get_theme_node().get_horizontal_padding();        
        
        let spacing = this._itemSpacing * (workspaceCols - 1);
        this._childWidth = Math.round(this._childHeight * workArea.width / workArea.height);
        if(workspaceCols*this._childWidth+spacing > availWidth) this._childWidth = (availWidth - spacing) / workspaceCols;

        alloc.min_size = Math.min((this._childWidth+this._itemSpacing)*workspaceCols, availWidth);
        alloc.natural_size = Math.min((this._childWidth+this._itemSpacing)*workspaceCols, availWidth);
    },
    
    _allocate : function (actor, box, flags) {
        let children = this._list.get_children();
        let childBox = new Clutter.ActorBox();

        let y = box.y1;
        let prevChildBoxY2 = box.y1 - this._itemSpacing;
        for(let row=0; row<workspaceRows; row++) {
            for(let col=0; col<workspaceCols; col++) {
                childBox.x1 = box.x1 + col*(this._childWidth+this._itemSpacing);
                childBox.x2 = childBox.x1+this._childWidth;
                childBox.y1 = box.y1 + row*(this._childHeight+this._itemSpacing);
                childBox.y2 = childBox.y1+this._childHeight;
                children[row*workspaceCols+col].allocate(childBox, flags);
            }
        }
    },
});

/***************************/
/* WORKSPACE GRID HANDLING */
/***************************/

let currentIndex = 0;
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
    currentIndex = index;
	return global.screen.get_workspace_by_index(index);
}

function myShowWorkspaceSwitcher(display, screen, window, binding) {
    let [action,,,direction] = binding.get_name().split('-');
    let direction = Meta.MotionDirection[direction.toUpperCase()];
    let newWs;

    if (action == 'switch') {
        this.actionMoveWorkspace(direction);
    } else {
        this.actionMoveWindow(window, direction);
    }
    let switcher = new MyWorkspaceSwitcherPopup();
    switcher.display(direction, currentIndex);
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

/************************/
/* INITIALIZATION STUFF */
/************************/
let origGet_neighbor, origShowWorkspaceSwitcher, origWorkspaceNumber;
function init() {
	origGet_neighbor = Meta.Workspace.prototype.get_neighbor;
	origShowWorkspaceSwitcher = WindowManager.WindowManager.prototype._showWorkspaceSwitcher;

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
