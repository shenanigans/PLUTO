
var DEFAULT_DEPTH = 50;
function UndoStack (depth) {
    this.stack = [];
    this.depth = depth || DEFAULT_DEPTH;
}

UndoStack.prototype.getAction = function (tool, action, target, undo) {
    // does the current action match the provided template?
    if (
        this.currentAction
     && this.currentAction.action === action
     && this.currentAction.target === target
    )
        return this.currentAction;

    var newAction = {
        action:     action,
        tool:       tool.info,
        target:     target,
        undo:       undo
    };
    this.stack.push (newAction);
    if (this.stack.length > this.depth)
        this.stack.unshift();
    this.currentAction = newAction;
    return newAction;
};

UndoStack.prototype.clearAction = function (action) {
    if (this.currentAction !== action)
        return;
    this.currentAction = this.stack.pop();
};

UndoStack.prototype.undo = function(){
    var action = this.stack.pop();
    if (action)
        action.undo();
    this.currentAction = this.stack.length ? this.stack[this.stack.length-1] : undefined;
};

module.exports = UndoStack;
