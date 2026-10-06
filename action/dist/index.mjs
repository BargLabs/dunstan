// Built by scripts/build.mjs from src/action/. Do not edit; run `pnpm build`.
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code2) {
        super();
        this._items = typeof code2 === "string" ? [code2] : code2;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code2 = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code2, args[i]);
        code2.push(strs[++i]);
      }
      return new _Code(code2);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str2(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str2;
    function addCodeArg(code2, arg) {
      if (arg instanceof _Code)
        code2.push(...arg._items);
      else if (arg instanceof Name)
        code2.push(arg);
      else
        code2.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str2`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code2 = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code2 = (0, code_1._)`${code2}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code2 = (0, code_1._)`${code2}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code2;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code2) {
        super();
        this.code = code2;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code2, n) => code2 + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code2 = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code2 += "else " + this.else.render(opts);
        return code2;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code2 = "try" + super.render(opts);
        if (this.catch)
          code2 += this.catch.render(opts);
        if (this.finally)
          code2 += this.finally.render(opts);
        return code2;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code2 = ["{"];
        for (const [key, value] of keyValues) {
          if (code2.length > 1)
            code2.push(",");
          code2.push(key);
          if (key !== value || this.opts.es5) {
            code2.push(":");
            (0, code_1.addCodeArg)(code2, value);
          }
        }
        code2.push("}");
        return new code_1._Code(code2);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr2 = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr2}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr2}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj2, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj2})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj2), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr2) {
      const hash = {};
      for (const item of arr2)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str2) {
      return unescapeJsonPointer(decodeURIComponent(str2));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str2) {
      return encodeURIComponent(escapeJsonPointer(str2));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str2) {
      if (typeof str2 == "number")
        return `${str2}`;
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str2) {
      return str2.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result2) {
      if (result2 === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result2 == "function" ? { ref: result2 } : { ref: result2, code: (0, codegen_1.stringify)(result2) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str2) {
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId: schemaId2, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId2] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId2] == "string")
          innerBaseId = addRef.call(this, sch[schemaId2]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj2, assign) {
        if (assign)
          Object.assign(this.params, obj2);
        else
          this.params = obj2;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId: schemaId2 } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId: schemaId2, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId: schemaId2 } = this.opts;
        const schId = schema[schemaId2];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId: schemaId2, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId: schemaId2 } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId: schemaId2, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isPort = RegExp.prototype.test.bind(/^\d*$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
    var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
    var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
    var BYTE_HEX = new Array(256);
    {
      const HEX_DIGITS = "0123456789ABCDEF";
      for (let i = 0; i < 256; i++) {
        BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
      }
    }
    function percentEncodeNonAscii(cp) {
      if (cp < 2048) {
        return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
      }
      if (cp < 65536) {
        return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
      }
      return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
    }
    function stringArrayToHexStripped(input2) {
      let acc = "";
      let code2 = 0;
      let i = 0;
      for (i = 0; i < input2.length; i++) {
        code2 = input2[i].charCodeAt(0);
        if (code2 === 48) {
          continue;
        }
        if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
          return "";
        }
        acc += input2[i];
        break;
      }
      for (i += 1; i < input2.length; i++) {
        code2 = input2[i].charCodeAt(0);
        if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
          return "";
        }
        acc += input2[i];
      }
      return acc;
    }
    var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
    var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
    var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function isZoneIdentifier(zone) {
      if (zone.length === 0) return false;
      for (let i = 0; i < zone.length; i++) {
        if (isZoneCharacter(zone[i])) continue;
        if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
          i += 2;
          continue;
        }
        return false;
      }
      return true;
    }
    function compressIPv6ZeroRun(hextets) {
      let bestStart = -1;
      let bestLength = 0;
      let runStart = -1;
      let runLength = 0;
      for (let i = 0; i < hextets.length; i++) {
        if (hextets[i] === "0") {
          if (runStart === -1) runStart = i;
          runLength++;
          if (runLength > bestLength) {
            bestLength = runLength;
            bestStart = runStart;
          }
        } else {
          runStart = -1;
          runLength = 0;
        }
      }
      if (bestLength < 2) return hextets.join(":");
      const head = hextets.slice(0, bestStart).join(":");
      const tail = hextets.slice(bestStart + bestLength).join(":");
      return head + "::" + tail;
    }
    function normalizeIPv6Address(input2) {
      const compression = input2.indexOf("::");
      if (compression !== -1 && input2.indexOf("::", compression + 1) !== -1) return void 0;
      const left = compression === -1 ? input2.split(":") : input2.slice(0, compression).split(":");
      const right = compression === -1 ? [] : input2.slice(compression + 2).split(":");
      if (compression !== -1) {
        if (left.length === 1 && left[0] === "") left.length = 0;
        if (right.length === 1 && right[0] === "") right.length = 0;
      }
      const parts = left.concat(right);
      let hextetCount = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "") return void 0;
        if (part.indexOf(".") !== -1) {
          if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
          hextetCount += 2;
          continue;
        }
        if (!isHextet(part)) return void 0;
        parts[i] = parseInt(part, 16).toString(16);
        hextetCount++;
      }
      if (compression === -1) {
        if (hextetCount !== 8) return void 0;
        return compressIPv6ZeroRun(parts);
      }
      if (hextetCount >= 8) return void 0;
      const expanded = parts.slice(0, left.length);
      for (let i = hextetCount; i < 8; i++) expanded.push("0");
      for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
      return compressIPv6ZeroRun(expanded);
    }
    function normalizeIPv6(host) {
      const bracketed = host[0] === "[" && host[host.length - 1] === "]";
      const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
      if (hasBracket && !bracketed) return { host, isIPV6: false, error: true };
      let input2 = bracketed ? host.slice(1, -1) : host;
      if (bracketed && isIPvFuture(input2)) {
        input2 = input2.toLowerCase();
        return { host: `[${input2}]`, escapedHost: input2, isIPV6: false, isIPVFuture: true };
      }
      if (findToken(input2, ":") < 2) {
        return { host, isIPV6: false, error: bracketed };
      }
      let zoneIdentifier = "";
      const zoneSeparator = input2.indexOf("%");
      if (zoneSeparator !== -1) {
        const separatorLength = input2.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
        zoneIdentifier = input2.slice(zoneSeparator + separatorLength);
        if (!isZoneIdentifier(zoneIdentifier)) return { host, isIPV6: false, error: true };
        input2 = input2.slice(0, zoneSeparator);
      }
      const address = normalizeIPv6Address(input2);
      if (address === void 0) return { host, isIPV6: false, error: true };
      return {
        host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
        escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
        isIPV6: true
      };
    }
    function findToken(str2, token) {
      let ind = 0;
      for (let i = 0; i < str2.length; i++) {
        if (str2[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path) {
      let input2 = path;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input2.length) {
        if (len === 1) {
          if (input2 === ".") {
            break;
          } else if (input2 === "/") {
            output.push("/");
            break;
          } else {
            output.push(input2);
            break;
          }
        } else if (len === 2) {
          if (input2[0] === ".") {
            if (input2[1] === ".") {
              break;
            } else if (input2[1] === "/") {
              input2 = input2.slice(2);
              continue;
            }
          } else if (input2[0] === "/") {
            if (input2[1] === "." || input2[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input2 === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input2[0] === ".") {
          if (input2[1] === ".") {
            if (input2[2] === "/") {
              input2 = input2.slice(3);
              continue;
            }
          } else if (input2[1] === "/") {
            input2 = input2.slice(2);
            continue;
          }
        } else if (input2[0] === "/") {
          if (input2[1] === ".") {
            if (input2[2] === "/") {
              input2 = input2.slice(2);
              continue;
            } else if (input2[2] === ".") {
              if (input2[3] === "/") {
                input2 = input2.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input2.indexOf("/", 1)) === -1) {
          output.push(input2);
          break;
        } else {
          output.push(input2.slice(0, nextSlash));
          input2 = input2.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input2, decodeUnreserved = false) {
      if (input2.indexOf("%") === -1) {
        return input2;
      }
      let output = "";
      for (let i = 0; i < input2.length; i++) {
        if (input2[i] === "%" && i + 2 < input2.length) {
          const hex = input2.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input2[i];
      }
      return output;
    }
    function normalizePathEncoding(input2) {
      let output = "";
      for (let i = 0; i < input2.length; i++) {
        const ch = input2[i];
        if (ch === "%" && i + 2 < input2.length) {
          const hex = input2.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(ch)) {
          output += ch;
        } else {
          const code2 = input2.charCodeAt(i);
          if (code2 < 128) {
            output += isEscapeSafe(code2) ? ch : BYTE_HEX[code2];
          } else if (code2 < 55296 || code2 > 57343) {
            output += percentEncodeNonAscii(code2);
          } else if (code2 <= 56319 && i + 1 < input2.length) {
            const low = input2.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function serializePathEncoding(input2, pathNoScheme = false) {
      let output = "";
      let firstSegment = pathNoScheme && input2[0] !== "/";
      for (let i = 0; i < input2.length; i++) {
        const ch = input2[i];
        if (ch === "%" && i + 2 < input2.length) {
          const hex = input2.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (ch === "/") {
          firstSegment = false;
        }
        if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
          output += ch;
        } else {
          const code2 = input2.charCodeAt(i);
          if (code2 < 128) {
            output += BYTE_HEX[code2];
          } else if (code2 < 55296 || code2 > 57343) {
            output += percentEncodeNonAscii(code2);
          } else if (code2 <= 56319 && i + 1 < input2.length) {
            const low = input2.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeComponent(input2, isAllowed) {
      let output = "";
      for (let i = 0; i < input2.length; i++) {
        const ch = input2[i];
        if (ch === "%" && i + 2 < input2.length) {
          const hex = input2.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (isAllowed(ch)) {
          output += ch;
        } else {
          const code2 = input2.charCodeAt(i);
          if (code2 < 128) {
            output += BYTE_HEX[code2];
          } else if (code2 < 55296 || code2 > 57343) {
            output += percentEncodeNonAscii(code2);
          } else if (code2 <= 56319 && i + 1 < input2.length) {
            const low = input2.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeUserinfo(input2) {
      return encodeComponent(input2, isUserinfoCharacter);
    }
    function encodeQuery(input2) {
      return encodeComponent(input2, isQueryFragmentCharacter);
    }
    function encodeFragment(input2) {
      return encodeComponent(input2, isQueryFragmentCharacter);
    }
    function isEscapeSafe(cp) {
      return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
    }
    function normalizeQueryFragmentEncoding(input2) {
      let output = "";
      for (let i = 0; i < input2.length; i++) {
        const ch = input2[i];
        if (ch === "%" && i + 2 < input2.length) {
          const hex = input2.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isQueryFragmentCharacter(ch)) {
          output += ch;
        } else {
          const code2 = input2.charCodeAt(i);
          if (code2 < 128) {
            output += isEscapeSafe(code2) ? ch : BYTE_HEX[code2];
          } else if (code2 < 55296 || code2 > 57343) {
            output += percentEncodeNonAscii(code2);
          } else if (code2 <= 56319 && i + 1 < input2.length) {
            const low = input2.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function escapePreservingEscapes(input2) {
      let output = "";
      for (let i = 0; i < input2.length; i++) {
        if (input2[i] === "%" && i + 2 < input2.length) {
          const hex = input2.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input2[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(encodeUserinfo(component.userinfo));
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = component.host;
        if (!isIPv4(host)) {
          let ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
            host = normalizePercentEncoding(host, true);
            ipV6res = normalizeIPv6(host);
          }
          if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        const port = String(component.port);
        if (!isPort(port)) {
          throw new TypeError("URI port is malformed.");
        }
        uriTokens.push(":");
        uriTokens.push(port);
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      serializePathEncoding,
      normalizeQueryFragmentEncoding,
      encodeUserinfo,
      encodeQuery,
      encodeFragment,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const queryIndex = wsComponent.resourceName.indexOf("?");
        const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
        wsComponent.path = path && path !== "/" ? path : void 0;
        wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches && matches[0] === urnComponent.path) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
    var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
    function decodeValidScheme(scheme) {
      const decodedScheme = unescape(String(scheme));
      if (!VALID_SCHEME.test(decodedScheme)) {
        throw new TypeError(MALFORMED_SCHEME_ERROR);
      }
      return decodedScheme;
    }
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize2(uri, options), options);
      }
      return uri;
    }
    function resolve(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const {
        parsed: baseParsed,
        malformedAuthorityOrPort: baseMalformed,
        malformedPercentEncoding: baseMalformedPercentEncoding,
        malformedSchemeSpecific: baseMalformedSchemeSpecific,
        malformedHost: baseMalformedHost,
        malformedScheme: baseMalformedScheme
      } = parseWithStatus(baseURI, schemelessOptions);
      const {
        parsed: relativeParsed,
        malformedAuthorityOrPort: relativeMalformed,
        malformedPercentEncoding: relativeMalformedPercentEncoding,
        malformedSchemeSpecific: relativeMalformedSchemeSpecific,
        malformedHost: relativeMalformedHost,
        malformedScheme: relativeMalformedScheme
      } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
      const resolvedHost = resolved.host;
      const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
      canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
      const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !new RegExp("\\P{ASCII}", "u").test(resolvedHost);
      if (resolved.error && !encodedASCIIHost) {
        throw new Error(resolved.error);
      }
      schemelessOptions.skipEscape = true;
      return serialize2(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize2(base, options), options);
        relative = parse(serialize2(relative, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative.scheme) {
        target.scheme = relative.scheme;
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
          target.userinfo = relative.userinfo;
          target.host = relative.host;
          target.port = relative.port;
          target.path = removeDotSegments(relative.path || "");
          target.query = relative.query;
        } else {
          if (!relative.path) {
            target.path = base.path;
            if (relative.query !== void 0) {
              target.query = relative.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative.path[0] === "/") {
              target.path = removeDotSegments(relative.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative.path;
              } else if (!base.path) {
                target.path = relative.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
    }
    function serialize2(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      if (component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
      }
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
      const pathNoScheme = !options.skipEscape && component.scheme === void 0 && !hasAuthority;
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = serializePathEncoding(component.path, pathNoScheme);
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (pathNoScheme) {
          s = serializePathEncoding(s, true);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", encodeQuery(component.query));
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", encodeFragment(component.fragment));
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function hasMalformedPercentEncoding(component) {
      if (component === void 0) return false;
      let percent = component.indexOf("%");
      while (percent !== -1) {
        if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
          return true;
        }
        percent = component.indexOf("%", percent + 3);
      }
      return false;
    }
    function isIPLiteral(host) {
      return host[0] === "[" && host[host.length - 1] === "]";
    }
    function hasMalformedComponentPercentEncoding(matches) {
      const host = matches[4];
      return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
    }
    function canonicalizeHost(parsed, options, schemeHandler, isIP) {
      if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
        try {
          parsed.host = new URL("http://" + parsed.host).hostname;
        } catch (e) {
          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
          return true;
        }
      }
      return false;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let malformedPercentEncoding = false;
      let malformedSchemeSpecific = false;
      let malformedHost = false;
      let malformedIPLiteral = false;
      let malformedScheme = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (parsed.scheme !== void 0) {
          const decodedScheme = unescape(parsed.scheme);
          if (VALID_SCHEME.test(decodedScheme)) {
            parsed.scheme = decodedScheme.toLowerCase();
          } else {
            parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
            malformedScheme = true;
          }
        }
        malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
        if (malformedPercentEncoding) {
          parsed.error = parsed.error || "URI contains malformed percent-encoding.";
        }
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const bracketedIPLiteral = isIPLiteral(parsed.host);
            const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
            const ipv6result = normalizeIPv6(parsed.host);
            isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
            malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
            parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
            if (malformedIPLiteral) {
              parsed.error = parsed.error || "URI host is malformed.";
              malformedAuthorityOrPort = true;
            }
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!malformedIPLiteral) {
          malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
        }
        if (uri.indexOf("%") !== -1 && parsed.host !== void 0 && !malformedIPLiteral) {
          let host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
          if (!isIP) {
            host = normalizePercentEncoding(host.toLowerCase());
          }
          parsed.host = reescapeHostDelimiters(host, isIP);
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.query) {
            parsed.query = normalizeQueryFragmentEncoding(parsed.query);
          }
          if (parsed.fragment) {
            parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
          if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) {
            malformedSchemeSpecific = true;
          }
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize2(parsed, opts),
        malformedAuthorityOrPort,
        malformedPercentEncoding,
        malformedSchemeSpecific,
        malformedHost,
        malformedScheme
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri !== "string" && typeof uri !== "object") {
        return void 0;
      }
      let value;
      try {
        value = typeof uri === "string" ? uri : serialize2(uri, opts);
      } catch {
        return void 0;
      }
      const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
      return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve,
      resolveComponent,
      equal,
      serialize: serialize2,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str2, flags) => new RegExp(str2, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId: schemaId2 } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId2 === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId2], false);
      }
      defaultMeta() {
        const { meta, schemaId: schemaId2 } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId2] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId: schemaId2 } = this.opts;
          id = schema[schemaId2];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId2} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId: schemaId2 } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId: schemaId2 });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId: schemaId2 } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId2];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId: schemaId2, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str2) {
      const len = str2.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str2.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str2.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId: schemaId2 } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId: schemaId2, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code2 = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code: code2 });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation2();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv, sch) {
        return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv20202 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv20202;
    module.exports = exports = Ajv20202;
    module.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv20202;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/formats.js
var require_formats = __commonJS({
  "node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/formats.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate, compare) {
      return { validate, compare };
    }
    exports.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports.fastFormats = {
      ...exports.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str2) {
      const matches = DATE.exec(str2);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str2) {
        const matches = TIME.exec(str2);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    var DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str2) {
        const dateTime = str2.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    var NOT_URI_FRAGMENT = /\/|:/;
    var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri(str2) {
      return NOT_URI_FRAGMENT.test(str2) && URI.test(str2);
    }
    var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str2) {
      BYTE.lastIndex = 0;
      return BYTE.test(str2);
    }
    var MIN_INT32 = -(2 ** 31);
    var MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    var Z_ANCHOR = /[^\\]\\Z/;
    function regex(str2) {
      if (Z_ANCHOR.test(str2))
        return false;
      try {
        new RegExp(str2);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/vocabularies/draft7.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports.default = draft7Vocabularies;
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports, module) {
    module.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/ajv.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv = Ajv;
    module.exports = exports = Ajv;
    module.exports.Ajv = Ajv;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/limit.js
var require_limit = __commonJS({
  "node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/limit.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatLimitDefinition = void 0;
    var ajv_1 = require_ajv();
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    exports.formatLimitDefinition = {
      keyword: Object.keys(KWDs),
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, keyword, it } = cxt;
        const { opts, self } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format = fCxt.schema;
          const fmtDef = self.formats[format];
          if (!fmtDef || fmtDef === true)
            return;
          if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
            throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
          }
          const fmt = gen.scopeValue("formats", {
            key: format,
            ref: fmtDef,
            code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : void 0
          });
          cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
          return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
        }
      },
      dependencies: ["format"]
    };
    var formatLimitPlugin = (ajv) => {
      ajv.addKeyword(exports.formatLimitDefinition);
      return ajv;
    };
    exports.default = formatLimitPlugin;
  }
});

// node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/index.js
var require_dist = __commonJS({
  "node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/dist/index.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var formats_1 = require_formats();
    var limit_1 = require_limit();
    var codegen_1 = require_codegen();
    var fullName2 = new codegen_1.Name("fullFormats");
    var fastName = new codegen_1.Name("fastFormats");
    var formatsPlugin = (ajv, opts = { keywords: true }) => {
      if (Array.isArray(opts)) {
        addFormats2(ajv, opts, formats_1.fullFormats, fullName2);
        return ajv;
      }
      const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName2];
      const list = opts.formats || formats_1.formatNames;
      addFormats2(ajv, list, formats, exportName);
      if (opts.keywords)
        (0, limit_1.default)(ajv);
      return ajv;
    };
    formatsPlugin.get = (name, mode = "full") => {
      const formats = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
      const f = formats[name];
      if (!f)
        throw new Error(`Unknown format "${name}"`);
      return f;
    };
    function addFormats2(ajv, list, fs, exportName) {
      var _a;
      var _b;
      (_a = (_b = ajv.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`;
      for (const f of list)
        ajv.addFormat(f, fs[f]);
    }
    module.exports = exports = formatsPlugin;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = formatsPlugin;
  }
});

// src/action/run.ts
import { appendFileSync, mkdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/spec/jcs.ts
import { createHash } from "node:crypto";

// src/spec/constants.ts
var SPEC_VERSION = "0.1.1";
var BLOCK_VERSION = "0.1";
var SUPPORTED_BLOCK_VERSIONS = [BLOCK_VERSION];
var BLOCK_INFO_STRING = "dunstan-handback";
var STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
var PREDICATE_TYPE = "https://barglabs.ai/dunstan/record/v0.1";
var DRAFT_SPEC_VERSION = "0.2.0-draft";
var DRAFT_PREDICATE_TYPE = "https://barglabs.ai/dunstan/record/v0.2-draft";
var BLOCK_SUBJECT_NAME = "handback-block";
var SIGNATURE_NAMESPACE = "dunstan-record";
var MAX_BLOCK_DEPTH = 32;

// src/spec/json.ts
var JsonReadError = class extends Error {
  code;
  pointer;
  constructor(code2, message, pointer) {
    super(message);
    this.name = "JsonReadError";
    this.code = code2;
    this.pointer = pointer;
  }
};
var NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
function escapePointerToken(token) {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}
function isWellFormedUtf16(text) {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 55296 && unit <= 56319) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 56320 && next <= 57343)) return false;
      i++;
    } else if (unit >= 56320 && unit <= 57343) {
      return false;
    }
  }
  return true;
}
function parseStrictJson(text) {
  let pos = 0;
  const fail2 = (message) => {
    throw new JsonReadError("invalid_json", `${message} at offset ${pos}`);
  };
  const skipWhitespace = () => {
    while (pos < text.length) {
      const c = text[pos];
      if (c === " " || c === "	" || c === "\n" || c === "\r") pos++;
      else break;
    }
  };
  const readString = () => {
    pos++;
    let out = "";
    while (true) {
      if (pos >= text.length) fail2("unterminated string");
      const c = text[pos];
      const unit = c.charCodeAt(0);
      if (c === '"') {
        pos++;
        break;
      }
      if (unit < 32) fail2("unescaped control character in string");
      if (c !== "\\") {
        out += c;
        pos++;
        continue;
      }
      const e = text[pos + 1];
      pos += 2;
      switch (e) {
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        case "/":
          out += "/";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "	";
          break;
        case "u": {
          const hex = text.slice(pos, pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail2("bad \\u escape");
          out += String.fromCharCode(Number.parseInt(hex, 16));
          pos += 4;
          break;
        }
        default:
          pos -= 2;
          fail2("bad escape");
      }
    }
    if (!isWellFormedUtf16(out)) fail2("string contains a lone surrogate");
    return out;
  };
  const readValue = (pointer, depth) => {
    skipWhitespace();
    const c = text[pos];
    if (c === "{" || c === "[") {
      if (depth + 1 > MAX_BLOCK_DEPTH) fail2(`nesting deeper than ${MAX_BLOCK_DEPTH}`);
      return c === "{" ? readObject(pointer, depth + 1) : readArray(pointer, depth + 1);
    }
    if (c === '"') return readString();
    if (text.startsWith("true", pos)) {
      pos += 4;
      return true;
    }
    if (text.startsWith("false", pos)) {
      pos += 5;
      return false;
    }
    if (text.startsWith("null", pos)) {
      pos += 4;
      return null;
    }
    NUMBER.lastIndex = pos;
    const match = NUMBER.exec(text);
    if (match === null) return fail2("unexpected character");
    pos += match[0].length;
    const n = Number(match[0]);
    if (!Number.isFinite(n)) fail2("number outside the IEEE 754 double range");
    return n;
  };
  const readArray = (pointer, depth) => {
    pos++;
    const out = [];
    skipWhitespace();
    if (text[pos] === "]") {
      pos++;
      return out;
    }
    while (true) {
      out.push(readValue(`${pointer}/${out.length}`, depth));
      skipWhitespace();
      const c = text[pos];
      pos++;
      if (c === "]") return out;
      if (c !== ",") {
        pos--;
        fail2("expected ',' or ']'");
      }
    }
  };
  const readObject = (pointer, depth) => {
    pos++;
    const entries = [];
    const seen = /* @__PURE__ */ new Set();
    skipWhitespace();
    if (text[pos] === "}") {
      pos++;
      return {};
    }
    while (true) {
      skipWhitespace();
      if (text[pos] !== '"') fail2("expected a member name");
      const key = readString();
      const memberPointer = `${pointer}/${escapePointerToken(key)}`;
      if (seen.has(key)) {
        throw new JsonReadError(
          "duplicate_member",
          `duplicate member name ${JSON.stringify(key)}`,
          memberPointer
        );
      }
      seen.add(key);
      skipWhitespace();
      if (text[pos] !== ":") fail2("expected ':'");
      pos++;
      entries.push([key, readValue(memberPointer, depth)]);
      skipWhitespace();
      const c = text[pos];
      pos++;
      if (c === "}") return Object.fromEntries(entries);
      if (c !== ",") {
        pos--;
        fail2("expected ',' or '}'");
      }
    }
  };
  const value = readValue("", 0);
  skipWhitespace();
  if (pos !== text.length) fail2("unexpected content after the JSON value");
  return value;
}

// src/spec/jcs.ts
var CanonicalizationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CanonicalizationError";
  }
};
function serializeString(value) {
  if (!isWellFormedUtf16(value))
    throw new CanonicalizationError("string contains a lone surrogate");
  return JSON.stringify(value);
}
function serializeNumber(value) {
  if (!Number.isFinite(value)) throw new CanonicalizationError(`${value} is not a JSON number`);
  return JSON.stringify(value);
}
function serialize(value, out) {
  if (value === null) {
    out.push("null");
    return;
  }
  switch (typeof value) {
    case "boolean":
      out.push(value ? "true" : "false");
      return;
    case "number":
      out.push(serializeNumber(value));
      return;
    case "string":
      out.push(serializeString(value));
      return;
    case "object": {
      if (Array.isArray(value)) {
        out.push("[");
        value.forEach((item, i) => {
          if (i > 0) out.push(",");
          serialize(item, out);
        });
        out.push("]");
        return;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new CanonicalizationError("only plain objects are JSON objects");
      }
      const keys = Object.keys(value).sort();
      out.push("{");
      keys.forEach((key, i) => {
        if (i > 0) out.push(",");
        out.push(serializeString(key), ":");
        serialize(value[key], out);
      });
      out.push("}");
      return;
    }
    default:
      throw new CanonicalizationError(`${typeof value} is not a JSON value`);
  }
}
function canonicalize(value) {
  const out = [];
  serialize(value, out);
  return out.join("");
}
function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function sha256Canonical(value) {
  return sha256Hex(Buffer.from(canonicalize(value), "utf8"));
}

// src/spec/record.ts
function overallVerdict(blockStatus, claims) {
  if (claims.some((c) => c.verdict === "fail")) return "fail";
  if (blockStatus !== "found" || claims.length === 0) return "unverifiable";
  if (claims.some((c) => c.verdict === "unverifiable")) return "unverifiable";
  return "pass";
}
function withoutSources(evidence) {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) return evidence;
  return Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "sources"));
}
function evidenceDigest(evidence) {
  return sha256Canonical(withoutSources(evidence));
}
function claimsDigest(claims) {
  return sha256Canonical(claims);
}

// src/check/rows.ts
function pass(check, field, declared, observed) {
  return { id: `${check}:${field}`, check, field, declared, observed, verdict: "pass" };
}
function fail(check, field, declared, observed, reason) {
  return { id: `${check}:${field}`, check, field, declared, observed, verdict: "fail", reason };
}
function unverifiable(check, field, declared, reason) {
  return {
    id: `${check}:${field}`,
    check,
    field,
    declared,
    observed: null,
    verdict: "unverifiable",
    reason
  };
}
function unreadReason(unread2) {
  return unread2.status === "unreadable" ? `source_unreadable:${unread2.source}` : `evidence_field_unpopulated:${unread2.field}`;
}
function absentSection(section) {
  return `evidence_field_unpopulated:${section}`;
}
function toSecond(timestamp2) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(timestamp2)) {
    throw new Error(`not an RFC 3339 UTC timestamp: ${timestamp2}`);
  }
  return timestamp2.slice(0, 19);
}
function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// src/check/checks.ts
function checkHead(block, evidence) {
  const observed = evidence.pullRequest.headSha;
  return [
    block.headCommit === observed ? pass("head", "/headCommit", block.headCommit, observed) : fail("head", "/headCommit", block.headCommit, observed, "head_mismatch")
  ];
}
function checkScope(block, evidence) {
  const files = evidence.files;
  const declared = block.filesChanged;
  if (files === void 0 || files.status !== "ok" || !files.complete) {
    const reason = files === void 0 ? absentSection("files") : files.status !== "ok" ? unreadReason(files) : "file_list_truncated";
    return [
      ...declared.map((path, i) => unverifiable("scope", `/filesChanged/${i}`, path, reason)),
      // One row stands for the files that could not be listed; it is never a pass.
      {
        id: "scope:undeclared",
        check: "scope",
        field: "/filesChanged",
        declared: null,
        observed: null,
        verdict: "unverifiable",
        reason
      }
    ];
  }
  const byPath = /* @__PURE__ */ new Map();
  for (const entry of files.entries) {
    byPath.set(entry.path, entry.path);
    if (entry.previousPath !== void 0 && !byPath.has(entry.previousPath)) {
      byPath.set(entry.previousPath, entry.path);
    }
  }
  const declaredSet = new Set(declared);
  const rows = declared.map((path, i) => {
    const match = byPath.get(path);
    return match !== void 0 ? pass("scope", `/filesChanged/${i}`, path, match) : fail("scope", `/filesChanged/${i}`, path, null, "declared_not_changed");
  });
  const omitted = files.entries.filter(
    (entry) => !declaredSet.has(entry.path) && (entry.previousPath === void 0 || !declaredSet.has(entry.previousPath))
  ).map((entry) => entry.path).sort(compareCodeUnits);
  for (const path of omitted) {
    rows.push({
      id: `scope:undeclared:${path}`,
      check: "scope",
      field: "/filesChanged",
      declared: null,
      observed: path,
      verdict: "fail",
      reason: "undeclared_file"
    });
  }
  return rows;
}
function qualifyIssue(issue, repository) {
  return issue.startsWith("#") ? `${repository}${issue}` : issue;
}
function sameIssue(a, b) {
  const [repoA, numA] = a.split("#");
  const [repoB, numB] = b.split("#");
  return numA === numB && repoA?.toLowerCase() === repoB?.toLowerCase();
}
function findReference(evidence, kind, ref) {
  return evidence.references?.find(
    (r) => r.kind === kind && (kind === "issue" ? sameIssue(r.ref, ref) : r.ref === ref)
  );
}
function checkReferences(block, evidence, repository) {
  return (block.references ?? []).map((reference, i) => {
    const field = `/references/${i}`;
    if ("issue" in reference && reference.relation === "closes") {
      const closing = evidence.closingReferences;
      if (closing === void 0) {
        return unverifiable("reference", field, reference, absentSection("closingReferences"));
      }
      if (closing.status !== "ok") {
        return unverifiable("reference", field, reference, unreadReason(closing));
      }
      const target = qualifyIssue(reference.issue, repository);
      const observed2 = { closing: closing.issues };
      if (closing.issues.some((issue) => sameIssue(issue, target))) {
        return pass("reference", field, reference, observed2);
      }
      const entry2 = findReference(evidence, "issue", target);
      if (entry2 === void 0) {
        return unverifiable("reference", field, reference, absentSection("references"));
      }
      if (entry2.status !== "ok") {
        return unverifiable("reference", field, reference, unreadReason(entry2));
      }
      return entry2.exists ? fail("reference", field, reference, observed2, "not_closing") : fail("reference", field, reference, { ...observed2, exists: false }, "not_found");
    }
    if ("issue" in reference) {
      const entry2 = findReference(evidence, "issue", qualifyIssue(reference.issue, repository));
      if (entry2 === void 0) {
        return unverifiable("reference", field, reference, absentSection("references"));
      }
      if (entry2.status !== "ok") {
        return unverifiable("reference", field, reference, unreadReason(entry2));
      }
      return entry2.exists ? pass("reference", field, reference, { exists: true }) : fail("reference", field, reference, { exists: false }, "not_found");
    }
    const entry = findReference(evidence, "commit", reference.commit);
    if (entry === void 0) {
      return unverifiable("reference", field, reference, absentSection("references"));
    }
    if (entry.status !== "ok" || entry.kind !== "commit") {
      return unverifiable(
        "reference",
        field,
        reference,
        entry.status === "ok" ? absentSection("references") : unreadReason(entry)
      );
    }
    const observed = { exists: entry.exists, reachableFromHead: entry.reachableFromHead };
    if (!entry.exists) return fail("reference", field, reference, observed, "not_found");
    if (!entry.reachableFromHead) {
      return fail("reference", field, reference, observed, "not_reachable");
    }
    return pass("reference", field, reference, observed);
  });
}
function sameRecord(a, b) {
  return a.kind === b.kind && a.workflow === b.workflow && a.job === b.job && a.artifact === b.artifact && a.path === b.path;
}
function countRow(field, declared, evidence, pick) {
  if (evidence === void 0)
    return unverifiable("count", field, declared, absentSection("testRecords"));
  if (evidence.status !== "ok")
    return unverifiable("count", field, declared, unreadReason(evidence));
  if (evidence.runs.length === 0) return unverifiable("count", field, declared, "record_not_found");
  const numbers = new Set(evidence.runs.map(pick));
  if (numbers.size > 1) return unverifiable("count", field, declared, "record_ambiguous");
  const observed = pick(evidence.runs[0]);
  return observed === declared ? pass("count", field, declared, observed) : fail("count", field, declared, observed, "count_mismatch");
}
function checkTests(block, evidence) {
  const rows = [];
  (block.tests ?? []).forEach((test, i) => {
    const countField = `/tests/${i}/count`;
    const failuresField = `/tests/${i}/failures`;
    if (test.record.kind !== "junit") {
      rows.push(unverifiable("count", countField, test.count, "no_comparable_record_field"));
      if (test.failures !== void 0) {
        rows.push(
          unverifiable("count", failuresField, test.failures, "no_comparable_record_field")
        );
      }
      return;
    }
    const record = test.record;
    const entry = evidence.testRecords?.find((r) => sameRecord(r.record, record));
    rows.push(countRow(countField, test.count, entry, (run) => run.executed));
    if (test.failures !== void 0) {
      rows.push(countRow(failuresField, test.failures, entry, (run) => run.failed));
    }
  });
  return rows;
}
function countedCheckRuns(runs, excludedIds) {
  const latest = /* @__PURE__ */ new Map();
  for (const run of runs) {
    const seen = latest.get(run.name);
    if (seen === void 0 || run.id > seen.id) latest.set(run.name, run);
  }
  const excluded = new Set(excludedIds);
  return [...latest.values()].filter((run) => !excluded.has(run.id)).sort((a, b) => a.id - b.id);
}
function checkChecks(block, evidence) {
  const checks = block.checks;
  if (checks === void 0) return [];
  const rows = [];
  const section = evidence.checkRuns;
  let reason;
  if (section === void 0) reason = absentSection("checkRuns");
  else if (section.status !== "ok") reason = unreadReason(section);
  const runs = section !== void 0 && section.status === "ok" ? countedCheckRuns(section.runs, section.excludedIds) : [];
  if (checks.total !== void 0) {
    const field = "/checks/total";
    if (reason !== void 0) rows.push(unverifiable("count", field, checks.total, reason));
    else if (runs.length === checks.total)
      rows.push(pass("count", field, checks.total, runs.length));
    else rows.push(fail("count", field, checks.total, runs.length, "count_mismatch"));
  }
  if (checks.allSucceeded !== void 0) {
    const field = "/checks/allSucceeded";
    const declared = checks.allSucceeded;
    if (reason !== void 0) {
      rows.push(unverifiable("count", field, declared, reason));
    } else if (runs.length === 0) {
      rows.push(unverifiable("count", field, declared, "no_check_runs"));
    } else {
      let observed;
      if (runs.some((r) => r.status === "completed" && r.conclusion !== "success"))
        observed = false;
      else if (runs.some((r) => r.status !== "completed")) observed = void 0;
      else observed = true;
      if (observed === void 0) {
        rows.push(unverifiable("count", field, declared, "checks_incomplete"));
      } else if (observed === declared) {
        rows.push(pass("count", field, declared, observed));
      } else {
        rows.push(fail("count", field, declared, observed, "all_succeeded_mismatch"));
      }
    }
  }
  return rows;
}
function checkCounts(block, evidence) {
  return [...checkTests(block, evidence), ...checkChecks(block, evidence)];
}
function checkMergedAt(block, evidence) {
  if (block.mergedAt === void 0) return [];
  const declared = block.mergedAt;
  const pr = evidence.pullRequest;
  if (!pr.merged) return [fail("time", "/mergedAt", declared, pr.mergedAt, "not_merged")];
  if (pr.mergedAt === null) {
    return [unverifiable("time", "/mergedAt", declared, "evidence_field_unpopulated:merged_at")];
  }
  return toSecond(declared) < toSecond(pr.mergedAt) ? [fail("time", "/mergedAt", declared, pr.mergedAt, "premature")] : [pass("time", "/mergedAt", declared, pr.mergedAt)];
}
function earliestSuccess(section, relations, at) {
  const times = section.deployments.filter((d) => relations.includes(d.relation) && d.successAt !== null).map((d) => d.successAt).filter((t) => toSecond(t) <= toSecond(at)).sort((a, b) => compareCodeUnits(toSecond(a), toSecond(b)) || compareCodeUnits(a, b));
  return times[0];
}
function checkDeployedAt(block, evidence) {
  if (block.deployedAt === void 0) return [];
  const declared = block.deployedAt;
  const field = "/deployedAt";
  const section = evidence.deployments?.find((d) => d.environment === declared.environment);
  if (section === void 0)
    return [unverifiable("time", field, declared, absentSection("deployments"))];
  if (section.status !== "ok")
    return [unverifiable("time", field, declared, unreadReason(section))];
  const related = evidence.pullRequest.merged ? ["head", "merge", "descendant"] : ["head"];
  const success = earliestSuccess(section, related, declared.at);
  if (success !== void 0) return [pass("time", field, declared, success)];
  if (evidence.pullRequest.merged && earliestSuccess(section, ["unknown"], declared.at) !== void 0) {
    return [unverifiable("time", field, declared, "source_unreadable:compare")];
  }
  return [fail("time", field, declared, null, "no_deployment")];
}
function checkTime(block, evidence) {
  return [...checkMergedAt(block, evidence), ...checkDeployedAt(block, evidence)];
}

// src/check/index.ts
function runChecks(block, evidence, repository) {
  return [
    ...checkHead(block, evidence),
    ...checkScope(block, evidence),
    ...checkReferences(block, evidence, repository),
    ...checkCounts(block, evidence),
    ...checkTime(block, evidence)
  ];
}

// src/evidence/junit.ts
var JunitError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "JunitError";
  }
};
var NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
var ENTITY = /&(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/y;
function countJunit(xml) {
  let pos = xml.startsWith("\uFEFF") ? 1 : 0;
  const stack = [];
  let roots = 0;
  let executed = 0;
  let failed = 0;
  const fail2 = (message) => {
    throw new JunitError(`${message} at offset ${pos}`);
  };
  const checkText = (text, start) => {
    for (let i = text.indexOf("&"); i !== -1; i = text.indexOf("&", i + 1)) {
      ENTITY.lastIndex = i;
      if (!ENTITY.test(text)) {
        pos = start + i;
        fail2("bad entity reference");
      }
    }
  };
  const readName = () => {
    NAME.lastIndex = pos;
    const match = NAME.exec(xml);
    if (match === null) return fail2("expected a name");
    pos += match[0].length;
    return match[0];
  };
  const skipSpace = () => {
    while (pos < xml.length && /[ \t\r\n]/.test(xml[pos])) pos++;
  };
  const open = (name) => {
    if (stack.length === 0) {
      roots++;
      if (roots > 1) fail2("more than one root element");
      if (name !== "testsuites" && name !== "testsuite") fail2(`root element is <${name}>`);
    }
    const parent = stack.at(-1);
    if (parent?.testcase !== void 0) {
      if (name === "skipped") parent.testcase.skipped = true;
      if (name === "failure" || name === "error") parent.testcase.failed = true;
    }
    stack.push(
      name === "testcase" ? { name, testcase: { skipped: false, failed: false } } : { name }
    );
  };
  const close = (name) => {
    const frame = stack.pop();
    if (frame === void 0 || frame.name !== name) fail2(`unbalanced </${name}>`);
    const testcase = frame?.testcase;
    if (testcase !== void 0 && !testcase.skipped) {
      executed++;
      if (testcase.failed) failed++;
    }
  };
  while (pos < xml.length) {
    const lt = xml.indexOf("<", pos);
    const textEnd = lt === -1 ? xml.length : lt;
    const text = xml.slice(pos, textEnd);
    if (stack.length === 0 && text.trim() !== "") fail2("text outside the root element");
    checkText(text, pos);
    if (text.includes("]]>")) fail2("']]>' in text");
    pos = textEnd;
    if (lt === -1) break;
    if (xml.startsWith("<!--", pos)) {
      const end = xml.indexOf("-->", pos + 4);
      if (end === -1) fail2("unterminated comment");
      pos = end + 3;
    } else if (xml.startsWith("<![CDATA[", pos)) {
      if (stack.length === 0) fail2("CDATA outside the root element");
      const end = xml.indexOf("]]>", pos + 9);
      if (end === -1) fail2("unterminated CDATA section");
      pos = end + 3;
    } else if (xml.startsWith("<!", pos)) {
      fail2("DOCTYPE and other declarations are refused");
    } else if (xml.startsWith("<?", pos)) {
      const end = xml.indexOf("?>", pos + 2);
      if (end === -1) fail2("unterminated processing instruction");
      pos = end + 2;
    } else if (xml.startsWith("</", pos)) {
      pos += 2;
      const name = readName();
      skipSpace();
      if (xml[pos] !== ">") fail2("expected '>'");
      pos++;
      close(name);
    } else {
      pos++;
      const name = readName();
      const seen = /* @__PURE__ */ new Set();
      while (true) {
        const before = pos;
        skipSpace();
        if (xml.startsWith("/>", pos)) {
          pos += 2;
          open(name);
          close(name);
          break;
        }
        if (xml[pos] === ">") {
          pos++;
          open(name);
          break;
        }
        if (pos === before) fail2("expected whitespace before an attribute");
        const attr = readName();
        if (seen.has(attr)) fail2(`duplicate attribute ${attr}`);
        seen.add(attr);
        skipSpace();
        if (xml[pos] !== "=") fail2("expected '='");
        pos++;
        skipSpace();
        const quote = xml[pos];
        if (quote !== '"' && quote !== "'") fail2("unquoted attribute value");
        const end = xml.indexOf(quote, pos + 1);
        if (end === -1) fail2("unterminated attribute value");
        const value = xml.slice(pos + 1, end);
        if (value.includes("<")) fail2("'<' in an attribute value");
        checkText(value, pos + 1);
        pos = end + 1;
      }
    }
  }
  if (stack.length > 0) fail2(`unclosed <${stack.at(-1)?.name}>`);
  if (roots === 0) fail2("no root element");
  return { executed, failed };
}

// src/evidence/zip.ts
import { inflateRawSync } from "node:zlib";
var ZipError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipError";
  }
};
var MAX_ENTRY_BYTES = 64 * 1024 * 1024;
var EOCD = 101010256;
var CENTRAL = 33639248;
var LOCAL = 67324752;
function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function findEndOfCentralDirectory(bytes) {
  const dv = view(bytes);
  const stop = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === EOCD) return i;
  }
  throw new ZipError("no end of central directory record");
}
function readZipEntry(bytes, path) {
  if (bytes.length < 22) throw new ZipError("archive too short");
  const dv = view(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = dv.getUint16(eocd + 10, true);
  let offset = dv.getUint32(eocd + 16, true);
  if (count === 65535 || offset === 4294967295) throw new ZipError("ZIP64 is not supported");
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || dv.getUint32(offset, true) !== CENTRAL) {
      throw new ZipError("bad central directory entry");
    }
    const method = dv.getUint16(offset + 10, true);
    const compressedSize = dv.getUint32(offset + 20, true);
    const size = dv.getUint32(offset + 24, true);
    const nameLength = dv.getUint16(offset + 28, true);
    const extraLength = dv.getUint16(offset + 30, true);
    const commentLength = dv.getUint16(offset + 32, true);
    const localOffset = dv.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== path) continue;
    if (compressedSize === 4294967295 || size === 4294967295 || localOffset === 4294967295) {
      throw new ZipError("ZIP64 is not supported");
    }
    if (size > MAX_ENTRY_BYTES) throw new ZipError(`entry larger than ${MAX_ENTRY_BYTES} bytes`);
    if (localOffset + 30 > bytes.length || dv.getUint32(localOffset, true) !== LOCAL) {
      throw new ZipError("bad local file header");
    }
    const dataStart = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.length)
      throw new ZipError("entry runs past the archive");
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return data;
    if (method === 8) {
      try {
        return new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }));
      } catch (e) {
        throw new ZipError(`cannot inflate ${path}: ${e.message}`);
      }
    }
    throw new ZipError(`compression method ${method} is not supported`);
  }
  return null;
}

// src/evidence/github.ts
var PER_PAGE = 100;
var FILES_API_LIMIT = 3e3;
var MAX_PAGES = 100;
var PullRequestUnreadable = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PullRequestUnreadable";
  }
};
var ShapeError = class extends Error {
};
function obj(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ShapeError();
  return value;
}
function arr(value) {
  if (!Array.isArray(value)) throw new ShapeError();
  return value;
}
function str(value) {
  if (typeof value !== "string") throw new ShapeError();
  return value;
}
function int(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ShapeError();
  return value;
}
function strOrNull(value) {
  return value === null || value === void 0 ? null : str(value);
}
function unreadable(source) {
  return { status: "unreadable", source };
}
function splitRepo(repository) {
  const [owner, name] = repository.split("/");
  return { owner, name };
}
function timestamp(value) {
  const text = str(value);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(text)) {
    throw new ShapeError();
  }
  return text;
}
function second(t) {
  return t.slice(0, 19);
}
async function readPullRequest(client, repository, number) {
  const read = await client.read("pull_request", `/repos/${repository}/pulls/${number}`);
  if (!read.ok) {
    throw new PullRequestUnreadable(
      `cannot read pull request ${repository}#${number} (${read.error}); no record is written`
    );
  }
  try {
    const pr = obj(read.json);
    const merged = pr.merged === true;
    const state = str(pr.state);
    if (state !== "open" && state !== "closed") throw new ShapeError();
    const base = obj(obj(pr.base).repo);
    return {
      evidence: {
        status: "ok",
        number: int(pr.number),
        state,
        merged,
        mergedAt: pr.merged_at === null || pr.merged_at === void 0 ? null : timestamp(pr.merged_at),
        headSha: str(obj(pr.head).sha),
        // For an open pull request merge_commit_sha is a test merge, not a merge.
        mergeSha: merged ? strOrNull(pr.merge_commit_sha) : null,
        changedFiles: int(pr.changed_files)
      },
      repository: str(base.full_name),
      body: strOrNull(pr.body)
    };
  } catch (e) {
    if (e instanceof ShapeError) {
      throw new PullRequestUnreadable(
        `pull request ${repository}#${number} answered in an unexpected shape; no record is written`
      );
    }
    throw e;
  }
}
async function readAllPages(client, kind, pathFor, itemsOf, map, options = {}) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = pathFor(page);
    const read = await client.read(kind, path);
    if (!read.ok && page === 1 && read.status === 404 && options.notFoundIsEmpty === true)
      return [];
    if (!read.ok) return null;
    let items;
    try {
      items = itemsOf(read.json).map(map);
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      client.markParseError(`GET ${path}`);
      return null;
    }
    out.push(...items);
    if (items.length < PER_PAGE || options.stop?.(items)) return out;
  }
  return null;
}
var FILE_STATUSES = /* @__PURE__ */ new Set([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged"
]);
async function readFiles(client, repository, pr) {
  const entries = await readAllPages(
    client,
    "pull_request_files",
    (page) => `/repos/${repository}/pulls/${pr.number}/files?per_page=${PER_PAGE}&page=${page}`,
    arr,
    (item) => {
      const f = obj(item);
      const status = str(f.status);
      if (!FILE_STATUSES.has(status)) throw new ShapeError();
      const entry = { path: str(f.filename), status };
      if (f.previous_filename !== void 0 && f.previous_filename !== null) {
        entry.previousPath = str(f.previous_filename);
      }
      return entry;
    }
  );
  if (entries === null) return unreadable("pull_request_files");
  const unique = new Map(entries.map((e) => [e.path, e]));
  const sorted = [...unique.values()].sort(
    (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  return {
    status: "ok",
    complete: sorted.length >= pr.changedFiles && entries.length < FILES_API_LIMIT,
    entries: sorted
  };
}
var CLOSING_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 100, after: $after) {
        nodes { number repository { nameWithOwner } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;
async function readClosingReferences(client, repository, number) {
  const { owner, name } = splitRepo(repository);
  const issues = [];
  let after = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const locator = `POST /graphql repository(${repository}).pullRequest(${number}).closingIssuesReferences${after === null ? "" : `(after:${after})`}`;
    const read = await client.read("closing_references", "/graphql", {
      method: "POST",
      locator,
      requestBody: JSON.stringify({
        query: CLOSING_QUERY,
        variables: { owner, name, number, after }
      })
    });
    if (!read.ok) return unreadable("closing_references");
    try {
      const body = obj(read.json);
      if (body.errors !== void 0 && body.errors !== null) throw new ShapeError();
      const pr = obj(obj(obj(body.data).repository).pullRequest);
      const connection = pr.closingIssuesReferences;
      if (connection === void 0 || connection === null) {
        return { status: "unpopulated", field: "closingIssuesReferences" };
      }
      const c = obj(connection);
      for (const node of arr(c.nodes)) {
        const n = obj(node);
        issues.push(`${str(obj(n.repository).nameWithOwner)}#${int(n.number)}`);
      }
      const info = obj(c.pageInfo);
      if (info.hasNextPage !== true) {
        return {
          status: "ok",
          issues: [...new Set(issues)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
        };
      }
      after = str(info.endCursor);
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      client.markParseError(locator);
      return unreadable("closing_references");
    }
  }
  return unreadable("closing_references");
}
function isNotFound(read) {
  return !read.ok && (read.status === 404 || read.status === 410);
}
async function isAncestor(client, repository, base, head) {
  const path = `/repos/${repository}/compare/${base}...${head}?per_page=1`;
  const read = await client.read("compare", path);
  if (!read.ok) return null;
  try {
    return int(obj(read.json).behind_by) === 0;
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    client.markParseError(`GET ${path}`);
    return null;
  }
}
async function readReferences(client, block, repository, headSha, closing) {
  const toRead = (block.references ?? []).filter((r) => {
    if (r.relation === "cites") return true;
    if (!("issue" in r) || closing?.status !== "ok") return false;
    const target = qualifyIssue(r.issue, repository);
    return !closing.issues.some((issue) => sameIssue(issue, target));
  });
  if (toRead.length === 0) return void 0;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const repositoryReadable = /* @__PURE__ */ new Map([[repository.toLowerCase(), true]]);
  for (const reference of toRead) {
    if ("issue" in reference) {
      const ref2 = qualifyIssue(reference.issue, repository);
      const key2 = `issue:${ref2.toLowerCase()}`;
      if (seen.has(key2)) continue;
      seen.add(key2);
      const [repo, num] = ref2.split("#");
      let readable = repositoryReadable.get(repo.toLowerCase());
      if (readable === void 0) {
        readable = (await client.read("repository", `/repos/${repo}`)).ok;
        repositoryReadable.set(repo.toLowerCase(), readable);
      }
      if (!readable) {
        out.push({ kind: "issue", ref: ref2, ...unreadable("repository") });
        continue;
      }
      const read2 = await client.read("issue", `/repos/${repo}/issues/${num}`);
      if (read2.ok) out.push({ kind: "issue", ref: ref2, status: "ok", exists: true });
      else if (isNotFound(read2)) out.push({ kind: "issue", ref: ref2, status: "ok", exists: false });
      else out.push({ kind: "issue", ref: ref2, ...unreadable("issue") });
      continue;
    }
    const ref = reference.commit;
    const key = `commit:${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const read = await client.read("commit", `/repos/${repository}/git/commits/${ref}`);
    if (isNotFound(read)) {
      out.push({ kind: "commit", ref, status: "ok", exists: false, reachableFromHead: false });
      continue;
    }
    if (!read.ok) {
      out.push({ kind: "commit", ref, ...unreadable("commit") });
      continue;
    }
    const reachable = ref === headSha ? true : await isAncestor(client, repository, ref, headSha);
    if (reachable === null) out.push({ kind: "commit", ref, ...unreadable("compare") });
    else
      out.push({ kind: "commit", ref, status: "ok", exists: true, reachableFromHead: reachable });
  }
  return out;
}
async function readCheckRuns(client, repository, commit, excludedIds) {
  const runs = await readAllPages(
    client,
    "check_runs",
    (page) => `/repos/${repository}/commits/${commit}/check-runs?filter=latest&per_page=${PER_PAGE}&page=${page}`,
    (json) => arr(obj(json).check_runs),
    (item) => {
      const r = obj(item);
      return {
        id: int(r.id),
        name: str(r.name),
        status: str(r.status),
        conclusion: strOrNull(r.conclusion)
      };
    }
  );
  if (runs === null) return unreadable("check_runs");
  return {
    status: "ok",
    commit,
    excludedIds: [...new Set(excludedIds)].sort((a, b) => a - b),
    runs: [...new Map(runs.map((r) => [r.id, r])).values()].sort((a, b) => a.id - b.id)
  };
}
async function readTestRecord(client, repository, record, headCommit) {
  const workflowFile = record.workflow.split("/").at(-1);
  const runsPath = (page) => `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?head_sha=${headCommit}&per_page=${PER_PAGE}&page=${page}`;
  const listed = await readAllPages(
    client,
    "workflow_runs",
    runsPath,
    (json) => arr(obj(json).workflow_runs),
    (item) => {
      const r = obj(item);
      return { id: int(r.id), attempt: int(r.run_attempt), path: str(r.path) };
    },
    // No workflow with that file name: there is no run, so no candidate run.
    { notFoundIsEmpty: true }
  );
  if (listed === null) return { record, ...unreadable("workflow_runs") };
  const runs = [];
  for (const run of listed.filter((r) => r.path.replace(/@.*$/, "") === record.workflow)) {
    const jobs = await readAllPages(
      client,
      "workflow_runs",
      (page) => `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=${PER_PAGE}&page=${page}`,
      (json) => arr(obj(json).jobs),
      (item) => str(obj(item).name)
    );
    if (jobs === null) return { record, ...unreadable("workflow_runs") };
    if (!jobs.includes(record.job)) continue;
    const artifacts = await readAllPages(
      client,
      "workflow_runs",
      (page) => `/repos/${repository}/actions/runs/${run.id}/artifacts?name=${encodeURIComponent(record.artifact)}&per_page=${PER_PAGE}&page=${page}`,
      (json) => arr(obj(json).artifacts),
      (item) => {
        const a = obj(item);
        return { id: int(a.id), name: str(a.name), expired: a.expired === true };
      }
    );
    if (artifacts === null) return { record, ...unreadable("workflow_runs") };
    const named = artifacts.filter((a) => a.name === record.artifact).sort((a, b) => a.id - b.id);
    if (named.length === 0) continue;
    if (named.length > 1) return { record, ...unreadable("artifact") };
    const artifact = named[0];
    if (artifact.expired) return { record, ...unreadable("artifact") };
    const zipPath = `/repos/${repository}/actions/artifacts/${artifact.id}/zip`;
    const download = await client.read("artifact", zipPath, {
      json: false,
      locatorSuffix: `#${record.path}`
    });
    if (!download.ok) return { record, ...unreadable("artifact") };
    try {
      const file = readZipEntry(download.body, record.path);
      if (file === null) continue;
      const counts = countJunit(new TextDecoder("utf-8").decode(file));
      runs.push({ runId: run.id, runAttempt: run.attempt, ...counts });
    } catch (e) {
      if (!(e instanceof ZipError || e instanceof JunitError)) throw e;
      client.markParseError(`GET ${zipPath}#${record.path}`);
      return { record, ...unreadable("artifact") };
    }
  }
  return { record, status: "ok", runs: runs.sort((a, b) => a.runId - b.runId) };
}
function mapDeployment(item) {
  const d = obj(item);
  return { id: int(d.id), sha: str(d.sha), createdAt: timestamp(d.created_at) };
}
async function readDeployments(client, repository, pr, deployedAt) {
  const environment = deployedAt.environment;
  const env = encodeURIComponent(environment);
  const fail2 = (source) => ({
    environment,
    ...unreadable(source)
  });
  const candidates = /* @__PURE__ */ new Map();
  const ofHead = await readAllPages(
    client,
    "deployments",
    (page) => `/repos/${repository}/deployments?environment=${env}&sha=${pr.headSha}&per_page=${PER_PAGE}&page=${page}`,
    arr,
    mapDeployment
  );
  if (ofHead === null) return fail2("deployments");
  for (const d of ofHead) candidates.set(d.id, d);
  if (pr.merged && pr.mergedAt !== null && pr.mergeSha !== null) {
    const mergedAt = second(pr.mergedAt);
    const at = second(deployedAt.at);
    const window = await readAllPages(
      client,
      "deployments",
      (page) => `/repos/${repository}/deployments?environment=${env}&per_page=${PER_PAGE}&page=${page}`,
      arr,
      mapDeployment,
      { stop: (items) => items.some((d) => second(d.createdAt) < mergedAt) }
    );
    if (window === null) return fail2("deployments");
    for (const d of window) {
      const created = second(d.createdAt);
      if (created >= mergedAt && created <= at) candidates.set(d.id, d);
    }
  }
  const deployments = [];
  const related = /* @__PURE__ */ new Map();
  for (const d of [...candidates.values()].sort((a, b) => a.id - b.id)) {
    let relation;
    if (d.sha === pr.headSha) relation = "head";
    else if (d.sha === pr.mergeSha) relation = "merge";
    else if (!pr.merged || pr.mergeSha === null) relation = "unrelated";
    else {
      let known = related.get(d.sha);
      if (known === void 0) {
        const ancestor = await isAncestor(client, repository, pr.mergeSha, d.sha);
        known = ancestor === null ? "unknown" : ancestor ? "descendant" : "unrelated";
        related.set(d.sha, known);
      }
      relation = known;
    }
    const statuses = await readAllPages(
      client,
      "deployments",
      (page) => `/repos/${repository}/deployments/${d.id}/statuses?per_page=${PER_PAGE}&page=${page}`,
      arr,
      (item) => {
        const s = obj(item);
        return { state: str(s.state), createdAt: timestamp(s.created_at) };
      }
    );
    if (statuses === null) return fail2("deployments");
    const successes = statuses.filter((s) => s.state === "success").map((s) => s.createdAt).sort((a, b) => second(a) < second(b) ? -1 : second(a) > second(b) ? 1 : 0);
    deployments.push({ id: d.id, sha: d.sha, relation, successAt: successes[0] ?? null });
  }
  return { environment, status: "ok", deployments };
}
async function readEvidence(client, input2) {
  const { block, repository } = input2;
  const pr = input2.pullRequest.evidence;
  const evidence = { pullRequest: pr, sources: [] };
  if (block !== null) {
    evidence.files = await readFiles(client, repository, pr);
    if ((block.references ?? []).some((r) => r.relation === "closes")) {
      evidence.closingReferences = await readClosingReferences(client, repository, pr.number);
    }
    const references = await readReferences(
      client,
      block,
      repository,
      pr.headSha,
      evidence.closingReferences
    );
    if (references !== void 0) evidence.references = references;
    if (block.checks !== void 0) {
      evidence.checkRuns = await readCheckRuns(
        client,
        repository,
        block.headCommit,
        input2.excludedCheckRunIds ?? []
      );
    }
    const records = /* @__PURE__ */ new Map();
    for (const test of block.tests ?? []) {
      if (test.record.kind !== "junit") continue;
      const record = test.record;
      records.set(canonicalize(record), record);
    }
    if (records.size > 0) {
      evidence.testRecords = [];
      for (const record of records.values()) {
        evidence.testRecords.push(
          await readTestRecord(client, repository, record, block.headCommit)
        );
      }
    }
    if (block.deployedAt !== void 0) {
      evidence.deployments = [await readDeployments(client, repository, pr, block.deployedAt)];
    }
  }
  evidence.sources = client.sortedSources();
  return evidence;
}

// src/record/checker.ts
import { readFileSync } from "node:fs";
var CHECKER_NAME = "dunstan";
var CHECKER_VERSION = "0.1.1";
function checkerIdentity(artifact) {
  return {
    name: CHECKER_NAME,
    version: CHECKER_VERSION,
    digest: { sha256: sha256Hex(readFileSync(new URL(artifact))) }
  };
}

// src/evidence/http.ts
var DEFAULT_API = "https://api.github.com";
var EMPTY = new Uint8Array();
var GitHubClient = class {
  sources = /* @__PURE__ */ new Map();
  #token;
  #baseUrl;
  #fetch;
  #now;
  #sleep;
  #warn;
  #maxAttempts;
  #maxWaitMs;
  constructor(options = {}) {
    this.#token = options.token;
    this.#baseUrl = options.baseUrl ?? DEFAULT_API;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date());
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#warn = options.warn ?? ((message) => process.stderr.write(`dunstan: ${message}
`));
    this.#maxAttempts = options.maxAttempts ?? 4;
    this.#maxWaitMs = options.maxWaitMs ?? 6e4;
  }
  get hasToken() {
    return this.#token !== void 0 && this.#token !== "";
  }
  // Sources in code-unit order of kind, then of locator, one entry per locator (spec section 6).
  sortedSources() {
    return [...this.sources.values()].sort(
      (a, b) => a.kind !== b.kind ? a.kind < b.kind ? -1 : 1 : a.locator < b.locator ? -1 : a.locator > b.locator ? 1 : 0
    );
  }
  async read(kind, path, options = {}) {
    const method = options.method ?? "GET";
    const locator = options.locator ?? `${method} ${path}${options.locatorSuffix ?? ""}`;
    const result2 = await this.#fetchWithRetry(method, path, options.requestBody, locator);
    let read;
    if (result2.kind === "network") {
      read = { ok: false, status: null, error: "network", body: EMPTY };
    } else if (result2.status < 200 || result2.status > 299) {
      read = {
        ok: false,
        status: result2.status,
        error: `http_${result2.status}`,
        body: result2.body
      };
    } else if (options.json === false) {
      read = { ok: true, status: result2.status, body: result2.body, json: null };
    } else {
      try {
        const json = JSON.parse(new TextDecoder().decode(result2.body));
        read = { ok: true, status: result2.status, body: result2.body, json };
      } catch {
        read = { ok: false, status: result2.status, error: "parse", body: result2.body };
      }
    }
    if (options.record !== false) {
      const source = {
        kind,
        locator,
        sha256: sha256Hex(read.body),
        readAt: this.#now().toISOString()
      };
      if (result2.kind === "response" && result2.etag !== null) source.etag = result2.etag;
      if (!read.ok) source.error = read.error;
      this.sources.set(locator, source);
    }
    return read;
  }
  // A read the caller found unusable after it succeeded (a body of the wrong shape) is recorded as a
  // parse failure, so the source entry agrees with the section's unreadable status.
  markParseError(locator) {
    const source = this.sources.get(locator);
    if (source !== void 0) source.error = "parse";
  }
  async #fetchWithRetry(method, path, body, locator) {
    const headers = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": `dunstan/${CHECKER_VERSION}`
    };
    if (this.hasToken) headers.authorization = `Bearer ${this.#token}`;
    if (body !== void 0) headers["content-type"] = "application/json";
    for (let attempt = 1; ; attempt++) {
      let response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method,
          headers,
          ...body === void 0 ? {} : { body },
          redirect: "follow"
        });
      } catch (e) {
        if (attempt < this.#maxAttempts) {
          await this.#sleep(backoffMs(attempt));
          continue;
        }
        this.#warn(`${locator}: network error after ${attempt} attempts (${e.message})`);
        return { kind: "network" };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const status = response.status;
      const wait = retryWaitMs(response, status, this.#now(), attempt);
      if (wait !== void 0 && attempt < this.#maxAttempts && wait <= this.#maxWaitMs) {
        await this.#sleep(wait);
        continue;
      }
      if (wait !== void 0) {
        const why = wait > this.#maxWaitMs ? `rate limited for ${Math.ceil(wait / 1e3)}s` : `${attempt} attempts`;
        this.#warn(`${locator}: giving up with HTTP ${status} (${why}); recorded as unreadable`);
      }
      return { kind: "response", status, body: bytes, etag: response.headers.get("etag") };
    }
  }
};
function backoffMs(attempt) {
  return Math.min(1e3 * 2 ** (attempt - 1), 8e3);
}
function retryWaitMs(response, status, now, attempt) {
  const retryAfter = response.headers.get("retry-after");
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  const rateLimited = status === 429 || status === 403 && (remaining === "0" || retryAfter !== null);
  if (rateLimited) {
    if (retryAfter !== null && /^[0-9]+$/.test(retryAfter)) return Number(retryAfter) * 1e3;
    if (reset !== null && /^[0-9]+$/.test(reset)) {
      return Math.max(0, Number(reset) * 1e3 - now.getTime()) + 1e3;
    }
    return backoffMs(attempt) * 8;
  }
  if (status >= 500 && status <= 599) return backoffMs(attempt);
  return void 0;
}

// src/evidence/report.ts
var ReportUnavailable = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReportUnavailable";
  }
};
function reportFromPullRequestBody(repository, pr) {
  return {
    bytes: new TextEncoder().encode(pr.body ?? ""),
    source: {
      kind: "pr-body",
      locator: `GET /repos/${repository}/pulls/${pr.evidence.number}#body`
    }
  };
}
async function reportFromComment(client, repository, number, login) {
  let latest;
  for (let page = 1; page <= 100; page++) {
    const read = await client.read(
      "pull_request",
      `/repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`,
      { record: false }
    );
    if (!read.ok) {
      throw new ReportUnavailable(
        `cannot list comments on ${repository}#${number} (${read.error})`
      );
    }
    if (!Array.isArray(read.json))
      throw new ReportUnavailable("comments answered in an unexpected shape");
    for (const item of read.json) {
      const user = item.user;
      if (typeof user?.login !== "string" || user.login.toLowerCase() !== login.toLowerCase())
        continue;
      const id = item.id;
      const createdAt = item.created_at;
      if (latest === void 0 || createdAt > latest.createdAt || createdAt === latest.createdAt && id > latest.id) {
        latest = { id, createdAt, body: typeof item.body === "string" ? item.body : "" };
      }
    }
    if (read.json.length < 100) break;
  }
  if (latest === void 0) {
    throw new ReportUnavailable(`${login} has no comment on ${repository}#${number}`);
  }
  return {
    bytes: new TextEncoder().encode(latest.body),
    source: {
      kind: "pr-comment",
      locator: `GET /repos/${repository}/issues/comments/${latest.id}#body`
    }
  };
}

// src/advisory/grammar.ts
var EXTRACTOR_VERSION = "0.1.2";
var ADVISORY_KINDS = [
  "file_changed",
  "reference_closes",
  "commit",
  "head_commit",
  "checks_succeeded",
  "check_count",
  "tests_passed",
  "test_count",
  "merged_at"
];
var GRAMMAR = {
  version: EXTRACTOR_VERSION,
  kinds: ADVISORY_KINDS,
  // The most words a token may sit from its verb. Tokens of the same class between them (a list of
  // paths, "#12, #13 and #14") do not count.
  window: 8,
  verbs: {
    // Past, participle and third-person forms only: "update src/a.ts" is an instruction or a plan,
    // not a report.
    file: [
      "added",
      "adds",
      "adjusted",
      "adjusts",
      "amended",
      "amends",
      "changed",
      "changes",
      "created",
      "creates",
      "deleted",
      "deletes",
      "edited",
      "edits",
      "extended",
      "extends",
      "fixed",
      "fixes",
      "modified",
      "modifies",
      "moved",
      "moves",
      "patched",
      "patches",
      "refactored",
      "refactors",
      "removed",
      "removes",
      "renamed",
      "renames",
      "replaced",
      "replaces",
      "reworked",
      "reworks",
      "rewrites",
      "rewritten",
      "rewrote",
      "touched",
      "touches",
      "tweaked",
      "tweaks",
      "updated",
      "updates"
    ],
    // GitHub's closing keywords, base form included: "Close #12" closes an issue.
    close: [
      "close",
      "closed",
      "closes",
      "fix",
      "fixed",
      "fixes",
      "resolve",
      "resolved",
      "resolves"
    ],
    commit: ["cherry-picked", "committed", "landed", "pushed"],
    merged: ["merged"],
    ran: ["executed", "ran"],
    // Predicates that follow a subject: "tests pass", "CI is green".
    pass: ["green", "pass", "passed", "passes", "passing", "succeed", "succeeded", "succeeds"],
    fail: ["fail", "failed", "failing", "fails", "red"],
    // Verbs that assert nothing about the record. They count for proximity, so "ran the suite in
    // packages/core/a.test.ts" binds the path to "ran", which is not a file verb.
    // Words that are as often nouns ("the build", "a run", "the use of") are left out.
    other: [
      "built",
      "cited",
      "compiled",
      "contain",
      "contains",
      "described",
      "describes",
      "exist",
      "exists",
      "expect",
      "expected",
      "explained",
      "explains",
      "found",
      "generated",
      "generates",
      "ignored",
      "imported",
      "included",
      "includes",
      "inspected",
      "install",
      "installed",
      "kept",
      "left",
      "lives",
      "located",
      "logged",
      "looked",
      "mentioned",
      "mentions",
      "opened",
      "pointed",
      "printed",
      "prints",
      "re-ran",
      "re-run",
      "read",
      "referenced",
      "requires",
      "reran",
      "rerun",
      "returned",
      "returns",
      "reviewed",
      "said",
      "saw",
      "says",
      "see",
      "seen",
      "showed",
      "shown",
      "shows",
      "skipped",
      "stored",
      "tested",
      "used",
      "viewed",
      "wrote",
      "written"
    ]
  },
  // Before a verb, within three words: the verb reports a plan, a wish or an instruction.
  modals: [
    "can",
    "could",
    "expect",
    "going",
    "hope",
    "intend",
    "may",
    "might",
    "must",
    "need",
    "needs",
    "plan",
    "please",
    "shall",
    "should",
    "todo",
    "try",
    "trying",
    "want",
    "wants",
    "will",
    "would"
  ],
  // A word ending in n't is a negation too.
  negations: ["neither", "never", "no", "none", "nor", "not", "without"],
  // Directly before a verb form, these make it an adjective: "the updated docs/guide.md".
  determiners: [
    "a",
    "an",
    "any",
    "each",
    "every",
    "her",
    "his",
    "its",
    "my",
    "our",
    "some",
    "that",
    "the",
    "their",
    "these",
    "this",
    "those",
    "your"
  ],
  // ...except these before a third-person form, where they are its subject: "This updates
  // docs/guide.md", "This passes CI".
  subjectDeterminers: ["that", "this"],
  // Words that open a new clause. A clause opened by a conditional asserts nothing.
  subordinators: [
    "after",
    "although",
    "because",
    "before",
    "but",
    "if",
    "once",
    "since",
    "that",
    "though",
    "unless",
    "until",
    "when",
    "whenever",
    "where",
    "whereas",
    "which",
    "while",
    "who"
  ],
  conditionals: ["if", "once", "unless", "until", "when", "whenever"],
  // A third-person verb that opens its clause and is followed by one of these is a noun: "Changes
  // to src/a.ts are out of scope".
  nounPrepositions: ["across", "for", "from", "in", "of", "on", "to", "under", "within"],
  // Between a closing keyword and its issue only these may stand: "fixes issue #12".
  closeFillers: ["&", "and", "bug", "bugs", "issue", "issues", "ticket", "tickets"],
  // Between "merged" and its timestamp.
  mergedFillers: ["as", "at", "been", "into", "main", "master", "of", "on", "the", "was"],
  // Between a subject (CI, checks, tests) and its predicate.
  predicateFillers: [
    "again",
    "all",
    "also",
    "are",
    "been",
    "both",
    "did",
    "do",
    "does",
    "has",
    "have",
    "is",
    "locally",
    "never",
    "no",
    "not",
    "now",
    "still",
    "turned",
    "was",
    "went",
    "were"
  ],
  // Between a path and its participle, at least one: "src/a.ts was updated".
  passiveFillers: ["also", "are", "been", "both", "has", "have", "is", "now", "was", "were"],
  // Between "passed" and its object: "passed all required checks".
  objectFillers: ["all", "required", "the"],
  // Between "ran" and its count: "ran all 42 tests".
  countFillers: ["all", "the"],
  // Within two words after a predicate, these narrow "all": "all checks pass except lint".
  exceptions: ["apart", "besides", "except", "excluding", "other", "save"],
  // Between "head" and a SHA: "head is now 3f2a1b9c".
  headFillers: ["at", "commit", "is", "now", "sha", "was"],
  // Between a file verb and a path, one of these makes the path a model or a comparison, not the
  // verb's object: "added a timetable based on ports/north.csv". Exemplifiers ("such as") and
  // "following" are left out: what they introduce is usually the object itself.
  analogues: [
    "analogous to",
    "as in",
    "based on",
    "cf",
    "compared to",
    "compared with",
    "like",
    "matching",
    "mirroring",
    "modeled on",
    "modelled on",
    "same as",
    "similar to",
    "unlike"
  ],
  // Bracket pairs. A path inside a pair still open at the path binds only to a verb inside it:
  // "edited the timetable (like ports/north.csv)". A markdown link's [text] is not an aside.
  brackets: ["()", "[]"],
  // Attribution (extractor 0.1.2). A claim is about this pull request's final state, not about
  // another pull request or repository, a change made and undone, a baseline, or a failure staged on
  // purpose.
  //
  // An issue or pull request (`#N`, `owner/repo#N`, a GitHub URL) in a clause that no closing
  // keyword binds makes the clause about it: "PR #10 was merged at …", "the file #11 added". One
  // directly after one of these phrases is this pull request: "This PR (#25) changes src/a.ts".
  selfNames: ["this change", "this pr", "this pull request"],
  // So does a repository named by one of these nouns, unless one of `ownRepository` stands directly
  // before it: "in the docs repo", "in another repository", but not "in this repo".
  repositoryNouns: ["repo", "repos", "repositories", "repository"],
  ownRepository: ["our", "same", "the", "this"],
  // After a clause that is about another pull request or repository, a clause that opens with one
  // of `pronouns`, or holds one of `possessives`, is about it too: "PR #10 was merged. Its head is
  // 3f2a1b9c." An object pronoun is not enough: "I fixed it in src/a.ts".
  pronouns: ["it", "they"],
  possessives: ["its", "their"],
  // A clause holding one of these narrates a change made and then undone, or made only for a while,
  // and proposes nothing: "temporarily removed src/a.ts", "added a throwaway marker, then reverted".
  transients: [
    "backed out",
    "reverted",
    "reverting",
    "temporarily",
    "then deleted",
    "then removed",
    "throw-away",
    "throwaway",
    "undid",
    "undone"
  ],
  // Before a SHA in its clause, one of these makes it a baseline or an earlier head, never
  // `head_commit`: "verified against origin/main (HEAD 3f2a1b9c)", "the prior head 3f2a1b9c". So
  // does a word starting with one of `remotePrefixes`.
  baselines: ["base", "baseline", "earlier", "former", "old", "original", "previous", "prior"],
  remotePrefixes: ["origin/", "upstream/"],
  // A clause with a fail predicate and one of these narrates a failure staged on purpose ("the new
  // tests fail as expected", "red without the guard", "the mutation tests fail"), and so does one
  // followed by a clause that opens with one of `narrationOpeners` ("the new tests failed before the
  // fix"). Such a clause proposes no tests or checks claim, except a pass predicate after the
  // failure followed directly by one of `finalStates`: "red without the guard, green with it".
  narrations: [
    "as expected",
    "as intended",
    "deliberately",
    "intentionally",
    "mutant",
    "mutants",
    "mutation",
    "mutations",
    "on purpose",
    "without"
  ],
  narrationOpeners: ["before"],
  finalStates: ["now", "with it", "with the change", "with the fix", "with this change"],
  // A word before a path that makes the path a command argument: "ran node scripts/build.mjs".
  // A word starting with '-' (a flag) does the same.
  commandWords: [
    "bash",
    "biome",
    "bun",
    "cargo",
    "cat",
    "cd",
    "chmod",
    "cp",
    "curl",
    "deno",
    "docker",
    "gh",
    "git",
    "go",
    "grep",
    "jest",
    "kubectl",
    "ls",
    "make",
    "mkdir",
    "mv",
    "node",
    "npm",
    "npx",
    "pnpm",
    "pytest",
    "python",
    "python3",
    "rm",
    "ruby",
    "sh",
    "touch",
    "tsc",
    "tsx",
    "vitest",
    "yarn"
  ],
  // Within two words before a hex token, these make it an id, not a commit: "run 7f3a9c21".
  shaBlockers: [
    "account",
    "attempt",
    "build",
    "id",
    "ids",
    "issue",
    "job",
    "jobs",
    "key",
    "node",
    "org",
    "pr",
    "run",
    "runs",
    "step",
    "token",
    "uid",
    "user",
    "users",
    "uuid",
    "workflow"
  ],
  // Directly before a SHA, these let any asserting verb bind it: "fixed it in commit 3f2a1b9".
  commitNouns: ["commit", "commits", "sha"],
  // Subjects. "checks" names all checks only when nothing but these stands before it: "the lint
  // checks pass" is a claim about some checks.
  checksNouns: ["checks", "ci"],
  checksQualifiers: ["all", "and", "ci", "required", "status", "the"],
  testsNouns: ["specs", "suite", "tests"],
  // Path names with no extension that are still files. Bare (no '/'), one counts only in inline
  // code: "the README" usually means README.md.
  extensionlessFiles: [
    "CODEOWNERS",
    "Dockerfile",
    "Gemfile",
    "Justfile",
    "LICENSE",
    "Makefile",
    "NOTICE",
    "Procfile",
    "Rakefile"
  ],
  // A bare name (no '/') with one of these extensions is a host name, a place, never a file.
  hostExtensions: ["ai", "app", "co", "com", "dev", "io", "net", "org"],
  // A line that starts with one of these is a log line and is not read.
  logLevels: [
    "DEBUG",
    "ERR",
    "ERR!",
    "ERROR",
    "FAIL",
    "FATAL",
    "INFO",
    "OK",
    "PASS",
    "SKIP",
    "TRACE",
    "WARN",
    "WARNING"
  ]
};
var EXTRACTOR = {
  version: EXTRACTOR_VERSION,
  digest: { sha256: sha256Canonical(GRAMMAR) }
};

// src/advisory/precision.ts
var SOURCE = "operator-adjudicated, Barg Labs internal corpus, 2026-10-05";
var CORPUS = "170 of Barg Labs' own merged agent pull requests";
var EXTRACTOR_0_1_1 = "ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360";
var PUBLISHED_PRECISION = [
  {
    extractorDigest: EXTRACTOR_0_1_1,
    precision: {
      value: 0.8,
      n: 30,
      interval: { method: "wilson", level: 0.95, low: 0.62694, high: 0.90495 },
      pullRequests: 170,
      method: `A seeded held-out sample of 30 of the 149 advisories extractor 0.1.1 proposed on ${CORPUS}, each adjudicated as a real claim of the report or not.`,
      source: SOURCE
    }
  }
];
var PUBLISHED_DIFFERS_ACCURACY = [
  {
    extractorDigest: EXTRACTOR_0_1_1,
    comparisonVersion: "0.2.0",
    differsAccuracy: {
      value: 0,
      n: 20,
      interval: { method: "wilson", level: 0.95, low: 0, high: 0.16113 },
      pullRequests: 170,
      method: `A census of every differs advisory, under extractor 0.1.1 and comparison 0.2.0, on ${CORPUS}, each adjudicated as marking a genuinely false claim or not.`,
      source: SOURCE,
      baseRate: {
        value: 0,
        n: 44,
        interval: { method: "wilson", level: 0.95, low: 0, high: 0.0803 },
        pullRequests: 170,
        method: `The 44 of the 149 advisories extractor 0.1.1 proposed on ${CORPUS} that the record could check (24 agreed with it; the 20 differs were adjudicated): none was a genuinely false completion claim. The other 105 could not be compared with the record and were not judged.`,
        source: SOURCE
      }
    }
  }
];
var UNMEASURED = "unmeasured";
function precisionFor(extractorDigest, published = PUBLISHED_PRECISION) {
  return published.find((p) => p.extractorDigest === extractorDigest)?.precision ?? null;
}
function differsAccuracyFor(extractorDigest, comparisonVersion, published = PUBLISHED_DIFFERS_ACCURACY) {
  return published.find(
    (p) => p.extractorDigest === extractorDigest && p.comparisonVersion === comparisonVersion
  )?.differsAccuracy ?? null;
}
function countOf(figure) {
  return Math.round(figure.value * figure.n);
}
function precisionText(precision) {
  return precision === null ? UNMEASURED : `${precision.value} over ${precision.n} adjudicated (${precision.source})`;
}

// src/advisory/advise.ts
var COMPARISON_VERSION = "0.2.0";
var COMPARISON = { version: COMPARISON_VERSION };
var HEX = /^[0-9a-f]{7,40}$/;
function blockFor(kind, value, headSha) {
  const base = { dunstan: BLOCK_VERSION, headCommit: headSha, filesChanged: [] };
  switch (kind) {
    case "file_changed":
      return typeof value === "string" ? { ...base, filesChanged: [value] } : void 0;
    case "reference_closes":
      return typeof value === "string" ? { ...base, references: [{ issue: value, relation: "closes" }] } : void 0;
    case "commit":
      return typeof value === "string" && value.length === 40 ? { ...base, references: [{ commit: value, relation: "cites" }] } : void 0;
    case "head_commit":
      return typeof value === "string" ? { ...base, headCommit: value } : void 0;
    case "checks_succeeded":
      return typeof value === "boolean" ? { ...base, checks: { allSucceeded: value } } : void 0;
    case "check_count":
      return typeof value === "number" ? { ...base, checks: { total: value } } : void 0;
    case "test_count":
      return typeof value === "number" ? { ...base, tests: [{ command: "", count: value, record: { kind: "report-prose" } }] } : void 0;
    case "merged_at":
      return typeof value === "string" ? { ...base, mergedAt: value } : void 0;
    case "tests_passed":
      return void 0;
  }
}
function rowFor(kind, value, evidence, repository) {
  const head = evidence.pullRequest.headSha;
  if ((kind === "commit" || kind === "head_commit") && typeof value === "string" && HEX.test(value) && head.startsWith(value)) {
    return checkHead({ dunstan: BLOCK_VERSION, headCommit: head, filesChanged: [] }, evidence)[0];
  }
  const block = blockFor(kind, value, head);
  if (block === void 0) return void 0;
  switch (kind) {
    case "file_changed":
      return checkScope(block, evidence)[0];
    case "reference_closes":
    case "commit":
      return checkReferences(block, evidence, repository)[0];
    case "head_commit":
      return checkHead(block, evidence)[0];
    case "checks_succeeded":
    case "check_count":
    case "test_count":
      return checkCounts(block, evidence)[0];
    case "merged_at":
      return checkTime(block, evidence)[0];
    case "tests_passed":
      return void 0;
  }
}
function byName(value, evidence) {
  const files = evidence.files;
  if (files === void 0 || files.status !== "ok") return [];
  const names = (p) => p === value || p.endsWith(`/${value}`);
  const matches = files.entries.filter((e) => names(e.path) || e.previousPath !== void 0 && names(e.previousPath)).map((e) => e.path);
  return [...new Set(matches)].sort(compareCodeUnits);
}
function compareAdvisory(claim, evidence, repository) {
  const row = rowFor(claim.kind, claim.value, evidence, repository);
  if (row === void 0) return { observed: null, note: "unanswered:no_comparable_record_field" };
  const observed = row.observed ?? null;
  if (claim.kind === "file_changed" && typeof claim.value === "string" && row.verdict !== "unverifiable") {
    const bare = !claim.value.includes("/");
    if (bare || row.verdict === "fail") {
      const candidates = byName(claim.value, evidence);
      if (candidates.length === 1)
        return { observed: candidates[0], note: "agrees_by_name" };
      if (candidates.length > 1) return { observed: candidates, note: "unanswered:ambiguous_path" };
    }
  }
  if (row.verdict === "pass") return { observed, note: "agrees" };
  return {
    observed,
    note: `${row.verdict === "fail" ? "differs" : "unanswered"}:${row.reason}`
  };
}
function readingBlock(block, proposed, headSha) {
  const references = proposed.flatMap((p) => {
    if (p.kind === "reference_closes" && typeof p.value === "string") {
      return [{ issue: p.value, relation: "closes" }];
    }
    if (p.kind === "commit" && typeof p.value === "string" && p.value.length === 40) {
      return [{ commit: p.value, relation: "cites" }];
    }
    return [];
  });
  const needsChecks = proposed.some(
    (p) => p.kind === "checks_succeeded" || p.kind === "check_count"
  );
  const needsFiles = proposed.some((p) => p.kind === "file_changed");
  if (block === null && references.length === 0 && !needsChecks && !needsFiles) return null;
  const base = block ?? { dunstan: BLOCK_VERSION, headCommit: headSha, filesChanged: [] };
  const reading = { ...base };
  if (references.length > 0) reading.references = [...base.references ?? [], ...references];
  if (needsChecks && base.checks === void 0) reading.checks = {};
  return reading;
}
function sameClaim(a, b, repository) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "reference_closes" && typeof a.value === "string" && typeof b.value === "string") {
    const q = (v) => (v.startsWith("#") ? `${repository}${v}` : v).toLowerCase();
    return q(a.value) === q(b.value);
  }
  return a.value === b.value;
}
function adviseClaims(proposed, evidence, repository) {
  const out = [];
  for (const p of proposed) {
    if (out.some((a) => sameClaim(a, p, repository))) continue;
    out.push({
      clause: p.clause,
      kind: p.kind,
      value: p.value,
      ...compareAdvisory(p, evidence, repository)
    });
  }
  return out;
}
function advisorySection(proposed, evidence, repository) {
  return {
    extractor: { version: EXTRACTOR.version, digest: { sha256: EXTRACTOR.digest.sha256 } },
    comparison: { version: COMPARISON.version },
    precision: precisionFor(EXTRACTOR.digest.sha256),
    differsAccuracy: differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON.version),
    advisories: adviseClaims(proposed, evidence, repository)
  };
}
function advisoryDigest(section) {
  return sha256Canonical(section);
}

// src/advisory/extract.ts
var words = (list) => new Set(list);
var V = GRAMMAR.verbs;
var FILE_VERBS = words(V.file);
var CLOSE_VERBS = words(V.close);
var COMMIT_VERBS = words(V.commit);
var MERGED_VERBS = words(V.merged);
var RAN_VERBS = words(V.ran);
var PASS = words(V.pass);
var FAIL = words(V.fail);
var ALL_VERBS = words([
  ...V.file,
  ...V.close,
  ...V.commit,
  ...V.merged,
  ...V.ran,
  ...V.pass,
  ...V.fail,
  ...V.other
]);
var MODALS = words(GRAMMAR.modals);
var NEGATIONS = words(GRAMMAR.negations);
var DETERMINERS = words(GRAMMAR.determiners);
var SUBJECT_DETERMINERS = words(GRAMMAR.subjectDeterminers);
var SUBORDINATORS = words(GRAMMAR.subordinators);
var CONDITIONALS = words(GRAMMAR.conditionals);
var NOUN_PREPOSITIONS = words(GRAMMAR.nounPrepositions);
var CLOSE_FILLERS = words(GRAMMAR.closeFillers);
var MERGED_FILLERS = words(GRAMMAR.mergedFillers);
var PREDICATE_FILLERS = words(GRAMMAR.predicateFillers);
var PASSIVE_FILLERS = words(GRAMMAR.passiveFillers);
var OBJECT_FILLERS = words(GRAMMAR.objectFillers);
var COUNT_FILLERS = words(GRAMMAR.countFillers);
var EXCEPTIONS = words(GRAMMAR.exceptions);
var HEAD_FILLERS = words(GRAMMAR.headFillers);
var COMMAND_WORDS = words(GRAMMAR.commandWords);
var SHA_BLOCKERS = words(GRAMMAR.shaBlockers);
var COMMIT_NOUNS = words(GRAMMAR.commitNouns);
var CHECKS_NOUNS = words(GRAMMAR.checksNouns);
var CHECKS_QUALIFIERS = words(GRAMMAR.checksQualifiers);
var TESTS_NOUNS = words(GRAMMAR.testsNouns);
var EXTENSIONLESS = words(GRAMMAR.extensionlessFiles);
var HOST_EXTENSIONS = words(GRAMMAR.hostExtensions);
var LOG_LEVELS = words(GRAMMAR.logLevels);
var phrases = (list) => list.map((phrase) => phrase.split(" "));
var ANALOGUES = phrases(GRAMMAR.analogues);
var SELF_NAMES = phrases(GRAMMAR.selfNames);
var REPOSITORY_NOUNS = words(GRAMMAR.repositoryNouns);
var OWN_REPOSITORY = words(GRAMMAR.ownRepository);
var PRONOUNS = words(GRAMMAR.pronouns);
var POSSESSIVES = words(GRAMMAR.possessives);
var TRANSIENTS = phrases(GRAMMAR.transients);
var BASELINES = words(GRAMMAR.baselines);
var NARRATIONS = phrases(GRAMMAR.narrations);
var NARRATION_OPENERS = words(GRAMMAR.narrationOpeners);
var FINAL_STATES = phrases(GRAMMAR.finalStates);
var CLOSERS = new Map(GRAMMAR.brackets.map((pair) => [pair[1], pair[0]]));
var OPENERS = new Set(CLOSERS.values());
var WINDOW = GRAMMAR.window;
function isLogLine(line) {
  const body = line.replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+/, "").trimStart();
  if (/^(?:\$\s|\[[^\]]*\]|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|[✓✗×✔✘❯›])/.test(body)) return true;
  if (/^(?:error|warning|Error|Warning)(?:\s+TS\d+)?:/.test(body)) return true;
  const first = /^[^\s:]+/.exec(body)?.[0] ?? "";
  return LOG_LEVELS.has(first);
}
function prepare(report) {
  const chars = report.split("");
  const blank = (start, end) => {
    for (let i = start; i < end; i++) if (chars[i] !== "\n") chars[i] = " ";
  };
  let offset = 0;
  let fence;
  for (const line of report.split("\n")) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (fence !== void 0) {
      blank(start, end);
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      if (close !== void 0 && close[0] === fence.char && close.length >= fence.length) {
        fence = void 0;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open !== void 0) {
      fence = { char: open[0], length: open.length };
      blank(start, end);
    } else if (/^ {0,3}>/.test(line) || isLogLine(line)) {
      blank(start, end);
    }
  }
  let text = chars.join("");
  for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) blank(m.index, m.index + m[0].length);
  text = chars.join("");
  const atoms = /* @__PURE__ */ new Map();
  const inAtom = new Uint8Array(text.length);
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const content = m[1];
    const lead = content.length - content.trimStart().length;
    const trimmed = content.trim();
    chars[m.index] = " ";
    chars[m.index + m[0].length - 1] = " ";
    if (trimmed === "") continue;
    const start = m.index + 1 + lead;
    atoms.set(start, { end: start + trimmed.length, kind: "code" });
    inAtom.fill(1, start, start + trimmed.length);
  }
  text = chars.join("");
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>()[\]`"']+/g)) {
    if (inAtom[m.index] === 1) continue;
    const url = m[0].replace(/[.,;:!?]+$/, "");
    atoms.set(m.index, { end: m.index + url.length, kind: "url" });
  }
  return { text, atoms };
}
var LEADING = /^[(["'*<{~]+/;
var TRAILING = /[)\]}"'*>~,.;:!?]+$/;
function makeWord(raw, start, atom, bracketAt) {
  const rawEnd = start + raw.length;
  if (atom !== void 0) {
    return { text: raw, lower: "", start, end: rawEnd, rawEnd, bracket: bracketAt(start), atom };
  }
  const lead = LEADING.exec(raw)?.[0].length ?? 0;
  const text = raw.slice(lead).replace(TRAILING, "");
  if (text === "") return void 0;
  const begin = start + lead;
  return {
    text,
    lower: text.toLowerCase(),
    start: begin,
    end: begin + text.length,
    rawEnd,
    bracket: bracketAt(begin)
  };
}
function bracketCursor(prep) {
  const { text, atoms } = prep;
  const links = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/\[[^[\]\n]*\]\(/g)) {
    links.add(m.index);
    links.add(m.index + m[0].length - 2);
  }
  const open = [];
  let p = 0;
  return (offset) => {
    while (p < offset) {
      const atom = atoms.get(p);
      if (atom !== void 0) {
        p = atom.end;
        continue;
      }
      const ch = text[p];
      if (!links.has(p)) {
        if (OPENERS.has(ch)) open.push(p);
        else if (CLOSERS.has(ch) && text[open.at(-1) ?? -1] === CLOSERS.get(ch)) open.pop();
      }
      p++;
    }
    return open.at(-1) ?? -1;
  };
}
function clausesOf(prep) {
  const { text, atoms } = prep;
  const bracketAt = bracketCursor(prep);
  const clauses = [];
  let current = [];
  const flush = (question = false) => {
    if (current.length > 0 && !question) clauses.push(current);
    current = [];
  };
  let blockLine2 = false;
  let i = 0;
  let gapStart = 0;
  while (i < text.length) {
    const atom = atoms.get(i);
    if (atom === void 0 && /\s/.test(text[i])) {
      i++;
      continue;
    }
    let end = atom?.end ?? i;
    if (atom === void 0) {
      while (end < text.length && !/\s/.test(text[end]) && !atoms.has(end)) end++;
    }
    const gap = text.slice(gapStart, i);
    let back = i;
    while (back > 0 && /[ \t\r]/.test(text[back - 1])) back--;
    const lineStart = back === 0 || text[back - 1] === "\n";
    if (/\n[ \t\r]*\n/.test(gap)) flush();
    if (gap.includes("\n")) {
      if (blockLine2) flush();
      blockLine2 = false;
    }
    const raw = text.slice(i, end);
    if (atom === void 0) {
      const marker = lineStart && /^(?:[-*+]|\d{1,3}[.)]|#{1,6})$/.test(raw);
      if (marker || /^\|+$/.test(raw)) {
        flush();
        if (lineStart && /^[#|]/.test(raw)) blockLine2 = true;
        gapStart = end;
        i = end;
        continue;
      }
      if (lineStart && raw.startsWith("|")) blockLine2 = true;
    }
    const word = makeWord(raw, i, atom?.kind, bracketAt);
    if (word !== void 0) {
      if (current.length > 0 && SUBORDINATORS.has(word.lower)) flush();
      current.push(word);
    }
    if (atom === void 0) {
      const stop = raw.replace(/["')\]*_]+$/, "").slice(-1);
      if (/[.;:!?]/.test(stop) && !(stop === ":" && word !== void 0 && CLOSE_VERBS.has(word.lower))) {
        flush(stop === "?");
      }
    }
    gapStart = end;
    i = end;
  }
  flush();
  return clauses;
}
var ISSUE = /^(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9}$/;
var ISSUE_URL = /^https?:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\/(?:issues|pull)\/([1-9][0-9]{0,9})\/?$/;
var TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;
function repoPath(token, inCode) {
  const path = token.replace(/^\.\//, "").replace(/(?::[0-9]+){1,2}$/, "").replace(/\([0-9]+(?:,[0-9]+)?\)?$/, "");
  if (!/^\.?[A-Za-z0-9_][A-Za-z0-9_.+/-]*$/.test(path)) return void 0;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return void 0;
  const last = segments[segments.length - 1];
  const named = EXTENSIONLESS.has(last);
  const extension = /^\.?[A-Za-z0-9_][A-Za-z0-9_.+-]*\.([A-Za-z][A-Za-z0-9]{0,9})$/.exec(last)?.[1];
  if (!named && extension === void 0) return void 0;
  const host = /\.([a-z]+)$/.exec(segments[0])?.[1];
  if (segments.length > 1 && host !== void 0 && HOST_EXTENSIONS.has(host)) return void 0;
  if (segments.length === 1 && named && !inCode) return void 0;
  if (segments.length === 1 && !named) {
    if (HOST_EXTENSIONS.has(extension.toLowerCase())) return void 0;
    const fileLike = /^[a-z0-9][a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.[a-z][a-z0-9]{0,9}$/.test(last) || /^[A-Z][A-Z0-9_-]+\.[a-z]{1,4}$/.test(last);
    if (!inCode && !fileLike) return void 0;
  }
  return path;
}
function classify(word) {
  if (word.atom === "url") {
    const m = ISSUE_URL.exec(word.text);
    return m === null ? { cls: "word" } : { cls: "issue", value: `${m[1]}#${m[2]}` };
  }
  if (word.atom === "code" && /\s/.test(word.text)) return { cls: "word" };
  const t = word.text;
  if (ISSUE.test(t)) return { cls: "issue", value: t };
  if (TIMESTAMP.test(t)) return { cls: "timestamp", value: t };
  if (/^[0-9a-fA-F]{7,40}$/.test(t) && /[0-9]/.test(t) && /[a-fA-F]/.test(t)) {
    return { cls: "sha", value: t.toLowerCase() };
  }
  if (/^[0-9]{1,6}$/.test(t) && word.atom === void 0) return { cls: "int", value: Number(t) };
  const path = repoPath(t, word.atom === "code");
  return path === void 0 ? { cls: "word" } : { cls: "path", value: path };
}
var Clause = class {
  constructor(words2) {
    this.words = words2;
    this.tokens = words2.map(classify);
  }
  words;
  tokens;
  // The clause narrates a failure staged on purpose (GRAMMAR.narrations).
  narrated = false;
  lower(i) {
    return this.words[i]?.lower ?? "";
  }
  // One of the phrases starts at k.
  phraseAt(k, list) {
    return list.some((phrase) => phrase.every((w, n) => this.lower(k + n) === w));
  }
  // One of the phrases starts at or after `from` and before `to`.
  holds(list, from = 0, to = this.words.length) {
    for (let k = from; k < to; k++) if (this.phraseAt(k, list)) return true;
    return false;
  }
  // A verb form after a determiner is an adjective or a noun: "the updated docs", "the fix".
  nominal(i) {
    const before = this.lower(i - 1);
    if (!DETERMINERS.has(before)) return false;
    return !(SUBJECT_DETERMINERS.has(before) && this.lower(i).endsWith("s"));
  }
  isVerb(i) {
    return ALL_VERBS.has(this.lower(i)) && !this.nominal(i);
  }
  isNegation(i) {
    const l = this.lower(i);
    return NEGATIONS.has(l) || l.endsWith("n't");
  }
  isModal(i) {
    const l = this.lower(i);
    return MODALS.has(l) || l.endsWith("'ll");
  }
  // The verb at i reports a fact: not an infinitive, an adjective, a plan or a noun.
  asserting(i) {
    if (this.lower(i - 1) === "to" || this.nominal(i)) return false;
    for (let k = i - 1; k >= Math.max(0, i - 3) && !this.isVerb(k); k--) {
      if (this.isModal(k) || this.isNegation(k)) return false;
    }
    const l = this.lower(i);
    if (i === 0 && l.endsWith("s") && NOUN_PREPOSITIONS.has(this.lower(1))) return false;
    return true;
  }
  // An analogue phrase starts at k and ends before j.
  analogue(k, j) {
    return ANALOGUES.some(
      (phrase) => k + phrase.length <= j && phrase.every((w, n) => this.lower(k + n) === w)
    );
  }
  // The nearest verb to the left of j, if no negation, modal or infinitive stands between, and it
  // is within the window. Tokens of the same class (a list) do not count toward the window. For a
  // path, a bracket still open at it and an analogue phrase are barriers too.
  leftVerb(j, cls) {
    const bracket = cls === "path" ? this.words[j].bracket : -1;
    let distance = 0;
    for (let k = j - 1; k >= 0; k--) {
      if (this.words[k].start < bracket) return void 0;
      if (this.isVerb(k)) return k;
      if (this.isNegation(k) || this.isModal(k)) return void 0;
      if (cls === "path" && this.analogue(k, j)) return void 0;
      if (this.lower(k) === "to" && k + 1 < j) {
        const next = this.lower(k + 1);
        if (/^[a-z]+$/.test(next) && !DETERMINERS.has(next)) return void 0;
      }
      if (this.tokens[k]?.cls === cls) continue;
      distance++;
      if (distance > WINDOW) return void 0;
    }
    return void 0;
  }
  // The verb at k binds: it is asserting and one of `verbs`.
  binds(k, verbs) {
    return k !== void 0 && verbs.has(this.lower(k)) && this.asserting(k);
  }
};
function clauseText(report, words2) {
  const first = words2[0];
  const last = words2[words2.length - 1];
  const text = report.slice(first.start, last.rawEnd).replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 299)}\u2026` : text;
}
function bindPath(c, j, value, emit) {
  for (let k2 = j - 1; k2 >= Math.max(0, j - 3) && !c.isVerb(k2); k2--) {
    const l = c.lower(k2);
    if (COMMAND_WORDS.has(l) || l.startsWith("-")) return;
  }
  const word = c.words[j];
  const span = { start: word.start, end: word.end };
  const passive = passiveAt(c, j);
  if (passive === -1) return;
  const k = c.leftVerb(j, "path");
  if (c.binds(k, FILE_VERBS)) {
    emit("file_changed", value, k, span);
    return;
  }
  if (passive !== void 0 && !negatedList(c, j)) emit("file_changed", value, passive, span);
}
function passiveAt(c, j) {
  let denied = false;
  for (let r = j + 1; r <= j + 4 && r < c.words.length; r++) {
    const l = c.lower(r);
    if (FILE_VERBS.has(l) && (l.endsWith("ed") || l === "rewritten")) {
      if (r === j + 1) return void 0;
      return denied ? -1 : r;
    }
    if (c.isNegation(r)) denied = true;
    else if (!PASSIVE_FILLERS.has(l)) return void 0;
  }
  return void 0;
}
function negatedList(c, j) {
  let distance = 0;
  for (let k = j - 1; k >= 0; k--) {
    if (c.tokens[k]?.cls === "path") continue;
    if (c.isNegation(k)) return true;
    if (c.isVerb(k) || ++distance > 3) return false;
  }
  return false;
}
function closingVerb(c, j) {
  for (let k = j - 1; k >= 0; k--) {
    const l = c.lower(k);
    if (CLOSE_VERBS.has(l)) return k;
    if (c.tokens[k]?.cls !== "issue" && !CLOSE_FILLERS.has(l)) return void 0;
  }
  return void 0;
}
function bindIssue(c, j, value, emit) {
  const k = closingVerb(c, j);
  if (k !== void 0 && c.asserting(k)) emit("reference_closes", value, k, c.words[j]);
}
function elsewhereAt(c) {
  for (let j = 0; j < c.words.length; j++) {
    const word = c.words[j];
    const issue = c.tokens[j]?.cls === "issue" || word.atom === void 0 && ISSUE.test(word.text.replace(/['’]s$/, ""));
    if (issue) {
      const own = SELF_NAMES.some((p) => p.length <= j && c.phraseAt(j - p.length, [p]));
      if (!own && closingVerb(c, j) === void 0) return j;
    } else if (REPOSITORY_NOUNS.has(c.lower(j)) && j > 0 && !OWN_REPOSITORY.has(c.lower(j - 1))) {
      return j;
    }
  }
  return -1;
}
function baselineBefore(c, j) {
  for (let k = 0; k < j; k++) {
    const text = c.words[k].text.toLowerCase();
    if (BASELINES.has(c.lower(k))) return true;
    if (GRAMMAR.remotePrefixes.some((p) => text.startsWith(p))) return true;
  }
  return false;
}
function bindSha(c, j, value, emit) {
  if (SHA_BLOCKERS.has(c.lower(j - 1)) || SHA_BLOCKERS.has(c.lower(j - 2))) return;
  const span = c.words[j];
  for (let k2 = j - 1; k2 >= Math.max(0, j - 3); k2--) {
    const l = c.lower(k2);
    if (l === "head") {
      if (!baselineBefore(c, j)) emit("head_commit", value, k2, span);
      return;
    }
    if (!HEAD_FILLERS.has(l)) break;
  }
  const k = c.leftVerb(j, "sha");
  if (k === void 0 || !c.asserting(k)) return;
  const verb = c.lower(k);
  const afterNoun = COMMIT_NOUNS.has(c.lower(j - 1)) && (FILE_VERBS.has(verb) || CLOSE_VERBS.has(verb) || MERGED_VERBS.has(verb));
  if (COMMIT_VERBS.has(verb) || afterNoun) emit("commit", value, k, span);
}
function bindTimestamp(c, j, value, emit) {
  for (let k = j - 1; k >= 0; k--) {
    const l = c.lower(k);
    if (MERGED_VERBS.has(l)) {
      if (c.asserting(k)) emit("merged_at", value, k, c.words[j]);
      return;
    }
    if (!MERGED_FILLERS.has(l)) return;
  }
}
function bindSubject(c, i, emit) {
  const l = c.lower(i);
  const checkRuns = l === "runs" && c.lower(i - 1) === "check";
  const checks = CHECKS_NOUNS.has(l) || checkRuns;
  if (!checks && !TESTS_NOUNS.has(l)) return;
  let first = checkRuns ? i - 1 : i;
  let count;
  const before = c.tokens[first - 1];
  if (before?.cls === "int") {
    count = before.value;
    first--;
  }
  if (checks && first > 0) {
    const q = c.lower(first - 1);
    if (!CHECKS_QUALIFIERS.has(q) && !c.isVerb(first - 1)) return;
  }
  for (let k = first - 1; k >= Math.max(0, first - 4) && !c.isVerb(k); k--) {
    if (c.isNegation(k)) return;
  }
  const kind = checks ? "checks_succeeded" : "tests_passed";
  for (let k = first - 1; k >= Math.max(0, first - 3); k--) {
    if (PASS.has(c.lower(k))) {
      const narrowed = EXCEPTIONS.has(c.lower(i + 1)) || EXCEPTIONS.has(c.lower(i + 2));
      const staged = c.narrated && !c.phraseAt(i + 1, FINAL_STATES);
      if (c.asserting(k) && !narrowed && !staged) emit(kind, true, k, spanOf(c, k, i));
      return;
    }
    if (!OBJECT_FILLERS.has(c.lower(k))) break;
  }
  let negated = false;
  for (let r = i + 1; r <= i + 4 && r < c.words.length; r++) {
    const p = c.lower(r);
    if (PASS.has(p) || FAIL.has(p)) {
      if (EXCEPTIONS.has(c.lower(r + 1)) || EXCEPTIONS.has(c.lower(r + 2))) return;
      if (c.narrated) {
        for (let s = r; s < c.words.length; s++) {
          const denied = [s - 1, s - 2].some(
            (k) => (c.isNegation(k) || c.isModal(k)) && c.lower(k) !== "without"
          );
          if (PASS.has(c.lower(s)) && c.phraseAt(s + 1, FINAL_STATES) && !denied) {
            emit(kind, true, s, spanOf(c, first, s));
            return;
          }
        }
        return;
      }
      const value = PASS.has(p) !== negated;
      const span = spanOf(c, first, r);
      if (checks) {
        emit("checks_succeeded", value, r, span);
        if (count !== void 0 && value) emit("check_count", count, r, span);
      } else {
        emit("tests_passed", value, r, span);
        if (count !== void 0 && value) emit("test_count", count, r, span);
      }
      return;
    }
    if (c.isNegation(r)) negated = !negated;
    else if (!PREDICATE_FILLERS.has(p)) return;
  }
}
function bindRan(c, k, emit) {
  if (!RAN_VERBS.has(c.lower(k)) || !c.asserting(k) || c.narrated) return;
  for (let j = k + 1; j <= k + 3 && j + 1 < c.words.length; j++) {
    const token = c.tokens[j];
    if (token?.cls === "int" && TESTS_NOUNS.has(c.lower(j + 1))) {
      emit("test_count", token.value, k, spanOf(c, j, j + 1));
      return;
    }
    if (!COUNT_FILLERS.has(c.lower(j))) return;
  }
}
function spanOf(c, from, to) {
  return { start: c.words[from].start, end: c.words[to].end };
}
function openedByNarration(prep, words2, next) {
  const first = next?.[0];
  const last = words2[words2.length - 1];
  if (first === void 0 || !NARRATION_OPENERS.has(first.lower)) return false;
  const stop = prep.text.slice(last.start, last.rawEnd).replace(/["')\]*_]+$/, "");
  return !/[.;:!?]$/.test(stop) && /^[ \t]*\n?[ \t]*$/.test(prep.text.slice(last.rawEnd, first.start));
}
function extractClaims(report) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const prep = prepare(report);
  const clauses = clausesOf(prep);
  let elsewhereBefore = false;
  clauses.forEach((words2, n) => {
    const c = new Clause(words2);
    let elsewhere = elsewhereAt(c);
    const refers = PRONOUNS.has(c.lower(0)) || words2.some((w) => POSSESSIVES.has(w.lower));
    if (elsewhere < 0 && elsewhereBefore && refers) elsewhere = 0;
    elsewhereBefore = elsewhere >= 0;
    if (CONDITIONALS.has(c.lower(0)) || c.holds(TRANSIENTS)) return;
    c.narrated = words2.some((w) => FAIL.has(w.lower)) && (c.holds(NARRATIONS) || openedByNarration(prep, words2, clauses[n + 1]));
    const clause = clauseText(report, words2);
    const emit = (kind, value, verb, span) => {
      if (elsewhere >= 0 && !(kind === "reference_closes" && verb < elsewhere)) return;
      const key = `${kind}\0${JSON.stringify(value)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        clause,
        verb: c.lower(verb),
        kind,
        value,
        span: { start: span.start, end: span.end }
      });
    };
    c.tokens.forEach((token, j) => {
      switch (token.cls) {
        case "path":
          bindPath(c, j, token.value, emit);
          break;
        case "issue":
          bindIssue(c, j, token.value, emit);
          break;
        case "sha":
          bindSha(c, j, token.value, emit);
          break;
        case "timestamp":
          bindTimestamp(c, j, token.value, emit);
          break;
        case "word":
          bindSubject(c, j, emit);
          bindRan(c, j, emit);
          break;
        case "int":
          break;
      }
    });
  });
  return out;
}

// src/retrieval/items.ts
function testId(test) {
  return test.classname === void 0 ? test.name : `${test.classname}.${test.name}`;
}
function recordItems(evidence) {
  const items = [];
  const sections = evidence.items;
  if (sections?.commits.status === "ok") {
    for (const c of sections.commits.entries) {
      items.push({
        type: "commit",
        id: c.sha,
        fields: [
          ["sha", c.sha],
          ["headline", c.headline]
        ]
      });
    }
  }
  if (sections?.timeline.status === "ok") {
    for (const e of sections.timeline.entries) {
      const fields = [["event", e.event]];
      if (e.ref !== void 0) fields.push(["ref", e.ref]);
      if (e.detail !== void 0) fields.push(["detail", e.detail]);
      items.push({ type: "timeline_event", id: e.id, fields });
    }
  }
  if (evidence.checkRuns?.status === "ok") {
    for (const run of countedCheckRuns(evidence.checkRuns.runs, evidence.checkRuns.excludedIds)) {
      items.push({ type: "check_run", id: String(run.id), fields: [["name", run.name]] });
    }
  }
  if (evidence.files?.status === "ok") {
    for (const f of evidence.files.entries) {
      const fields = [["path", f.path]];
      if (f.previousPath !== void 0) fields.push(["previousPath", f.previousPath]);
      items.push({ type: "file", id: f.path, fields });
    }
  }
  if (sections?.tests.status === "ok") {
    for (const t of sections.tests.entries) {
      const fields = [["name", t.name]];
      if (t.classname !== void 0) fields.push(["classname", t.classname]);
      items.push({ type: "test", id: testId(t), fields });
    }
  }
  return items;
}

// src/retrieval/bm25.ts
var BM25_K1 = 1.2;
var BM25_B = 0.75;
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "all",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "did",
  "do",
  "for",
  "from",
  "had",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "now",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "then",
  "there",
  "these",
  "this",
  "those",
  "to",
  "was",
  "were",
  "which",
  "with"
]);
function stem(token) {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
}
function tokenize(text) {
  return text.replace(new RegExp("([\\p{Ll}\\p{N}])(\\p{Lu})", "gu"), "$1 $2").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOPWORDS.has(t)).map(stem);
}
var Bm25Index = class {
  termFrequencies;
  lengths;
  averageLength;
  documentFrequency = /* @__PURE__ */ new Map();
  constructor(documents) {
    this.termFrequencies = documents.map((tokens) => {
      const tf = /* @__PURE__ */ new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys())
        this.documentFrequency.set(t, (this.documentFrequency.get(t) ?? 0) + 1);
      return tf;
    });
    this.lengths = documents.map((tokens) => tokens.length);
    const total = this.lengths.reduce((sum, n) => sum + n, 0);
    this.averageLength = documents.length === 0 ? 0 : total / documents.length;
  }
  // The Lucene form, which is never negative: ln(1 + (N - n + 0.5) / (n + 0.5)).
  idf(term) {
    const n = this.documentFrequency.get(term) ?? 0;
    const N = this.termFrequencies.length;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }
  // One score per document. Each distinct query term counts once, so repeating a word in a claim
  // does not inflate a score.
  scores(query) {
    const terms = [...new Set(query)];
    return this.termFrequencies.map((tf, i) => {
      const length = this.lengths[i] ?? 0;
      const norm = this.averageLength === 0 ? 1 : 1 - BM25_B + BM25_B * length / this.averageLength;
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (f === void 0) continue;
        score += this.idf(term) * (f * (BM25_K1 + 1)) / (f + BM25_K1 * norm);
      }
      return score;
    });
  }
};

// src/retrieval/identifiers.ts
var MIN_NAME_LENGTH = 4;
var SHA = /(?<![0-9A-Za-z])[0-9a-fA-F]{7,40}(?![0-9A-Za-z])/g;
var ISSUE2 = /(?<![\w/.-])((?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9})(?![0-9])/g;
var WORD = /[A-Za-z0-9_]/;
var PATH_CHAR = /[A-Za-z0-9._/-]/;
function stringLeaves(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringLeaves(v, out);
  else if (value !== null && typeof value === "object")
    for (const v of Object.values(value)) stringLeaves(v, out);
  return out;
}
function claimTexts(claim) {
  return [claim.text, ...stringLeaves(claim.declaredValue, [])];
}
function occursBounded(haystack, needle, inside) {
  if (needle.length === 0) return false;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    const next = haystack[at + needle.length + 1];
    const openBefore = before === void 0 || !inside.test(before);
    const openAfter = after === void 0 || !inside.test(after) || after === "." && (next === void 0 || !/[A-Za-z0-9]/.test(next));
    if (openBefore && openAfter) return true;
  }
  return false;
}
function shaTokens(texts) {
  const out = [];
  for (const text of texts) {
    for (const m of text.matchAll(SHA)) {
      const token = m[0].toLowerCase();
      if (token.length === 40 || /[0-9]/.test(token)) out.push(token);
    }
  }
  return out;
}
function issueRefs(texts, repository) {
  const out = [];
  for (const text of texts) {
    for (const m of text.matchAll(ISSUE2)) out.push(qualifyIssue(m[1], repository));
  }
  return out;
}
function identifierMatches(claim, items, repository) {
  const texts = claimTexts(claim);
  const shas = shaTokens(texts);
  const issues = issueRefs(texts, repository);
  const named = (value, inside) => texts.some((t) => t === value || occursBounded(t, value, inside));
  const matches = /* @__PURE__ */ new Map();
  items.forEach((item, i) => {
    for (const [field, value] of item.fields) {
      let hit = false;
      switch (`${item.type}.${field}`) {
        case "commit.sha":
          hit = shas.some((s) => value.startsWith(s));
          break;
        case "timeline_event.ref":
          hit = /^[0-9a-f]{40}$/.test(value) ? shas.some((s) => value.startsWith(s)) : issues.some((ref) => sameIssue(ref, value));
          break;
        case "file.path":
        case "file.previousPath":
          hit = named(value, PATH_CHAR);
          break;
        case "check_run.name":
        case "test.name":
          hit = value.length >= MIN_NAME_LENGTH && named(value, WORD);
          break;
      }
      if (hit) {
        matches.set(i, field);
        return;
      }
    }
    if (item.type === "test" && item.id !== item.fields[0]?.[1] && named(item.id, WORD)) {
      matches.set(i, "id");
    }
  });
  return matches;
}

// src/retrieval/retrieve.ts
var ARM_A = "A";
var BM25_FLOOR = 1;
var SCORE_DECIMALS = 6;
function round(score) {
  const scale = 10 ** SCORE_DECIMALS;
  return Math.round(score * scale) / scale;
}
function bestField(item, terms, index) {
  let best = item.fields[0]?.[0] ?? "id";
  let bestWeight = -1;
  for (const [name, text] of item.fields) {
    let weight = 0;
    for (const t of new Set(tokenize(text))) if (terms.has(t)) weight += index.idf(t);
    if (weight > bestWeight) {
      best = name;
      bestWeight = weight;
    }
  }
  return best;
}
function itemTokens(item) {
  return item.fields.flatMap(([, text]) => tokenize(text));
}
function compareRanked(a, b) {
  const sa = a.candidate.score;
  const sb = b.candidate.score;
  if (sa === null && sb !== null) return -1;
  if (sa !== null && sb === null) return 1;
  if (sa !== null && sb !== null && sa !== sb) return sb - sa;
  return a.order - b.order || compareCodeUnits(a.candidate.id, b.candidate.id);
}
function retrieve(claim, items, opts) {
  const allowed = opts.types === void 0 ? void 0 : new Set(opts.types);
  const exact = identifierMatches(claim, items, opts.repository);
  const index = new Bm25Index(items.map(itemTokens));
  const query = claimTexts(claim).flatMap(tokenize);
  const terms = new Set(query);
  const scores = index.scores(query);
  const ranked = [];
  items.forEach((item, order) => {
    if (allowed !== void 0 && !allowed.has(item.type)) return;
    const field = exact.get(order);
    if (field !== void 0) {
      ranked.push({
        order,
        candidate: { type: item.type, id: item.id, score: null, matchedField: field }
      });
      return;
    }
    const score = round(scores[order] ?? 0);
    if (score < BM25_FLOOR) return;
    ranked.push({
      order,
      candidate: {
        type: item.type,
        id: item.id,
        score,
        matchedField: bestField(item, terms, index)
      }
    });
  });
  ranked.sort(compareRanked);
  const out = ranked.map((r) => r.candidate);
  return opts.limit === void 0 ? out : out.slice(0, opts.limit);
}

// src/retrieval/reader-claims.ts
var READER_CLAIM_KINDS = /* @__PURE__ */ new Map([
  ["file_changed", "file"],
  ["commit_present", "commit"],
  ["reference_in_timeline", "timeline_event"],
  ["check_succeeded", "check_run"],
  ["test_passed", "test"]
]);
function unread(section) {
  return section.status === "unreadable" ? `source_unreadable:${section.source}` : `evidence_field_unpopulated:${section.field}`;
}
function verdictOf(verdict, observed, reason) {
  return reason === void 0 ? { observed, verdict } : { observed, verdict, reason };
}
var unverifiable2 = (reason) => verdictOf("unverifiable", null, reason);
function sectionReason(type, evidence) {
  const items = evidence.items;
  switch (type) {
    case "file":
      if (evidence.files === void 0) return absentSection("files");
      return evidence.files.status === "ok" ? void 0 : unread(evidence.files);
    case "check_run":
      if (evidence.checkRuns === void 0) return absentSection("checkRuns");
      return evidence.checkRuns.status === "ok" ? void 0 : unread(evidence.checkRuns);
    case "commit":
      if (items === void 0) return absentSection("items.commits");
      return items.commits.status === "ok" ? void 0 : unread(items.commits);
    case "timeline_event":
      if (items === void 0) return absentSection("items.timeline");
      return items.timeline.status === "ok" ? void 0 : unread(items.timeline);
    case "test":
      if (items === void 0) return absentSection("items.tests");
      return items.tests.status === "ok" ? void 0 : unread(items.tests);
  }
}
function lookup(type, evidence) {
  const entries = /* @__PURE__ */ new Map();
  const put = (id, value) => entries.set(id, value);
  const items = evidence.items;
  if (type === "file" && evidence.files?.status === "ok") {
    for (const f of evidence.files.entries) put(f.path, f);
  } else if (type === "check_run" && evidence.checkRuns?.status === "ok") {
    for (const r of countedCheckRuns(evidence.checkRuns.runs, evidence.checkRuns.excludedIds))
      put(String(r.id), r);
  } else if (type === "commit" && items?.commits.status === "ok") {
    for (const c of items.commits.entries) put(c.sha, c);
  } else if (type === "timeline_event" && items?.timeline.status === "ok") {
    for (const e of items.timeline.entries) put(e.id, e);
  } else if (type === "test" && items?.tests.status === "ok") {
    for (const t of items.tests.entries) put(testId(t), t);
  }
  return entries;
}
var ISSUE_REF = /^(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9}$/;
function checkReaderClaim(claim, evidence, repository) {
  const type = READER_CLAIM_KINDS.get(claim.kind);
  if (type === void 0) return unverifiable2("no_comparable_record_field");
  const declared = claim.declaredValue;
  const wantsBoolean = type === "check_run" || type === "test";
  if (wantsBoolean ? typeof declared !== "boolean" : typeof declared !== "string") {
    return unverifiable2("no_comparable_record_field");
  }
  const missing = sectionReason(type, evidence);
  if (missing !== void 0) return unverifiable2(missing);
  const entries = lookup(type, evidence);
  const relevant = claim.candidates.filter((c) => c.type === type);
  const observed = relevant.map((c) => entries.get(c.id));
  if (observed.some((v) => v === void 0)) return unverifiable2("candidate_not_in_evidence");
  const truncated = type === "file" && evidence.files?.status === "ok" && !evidence.files.complete;
  if (relevant.length === 0) {
    return unverifiable2(truncated ? "file_list_truncated" : "no_matching_record_item");
  }
  switch (type) {
    case "file": {
      const files = observed;
      const match = files.find((f) => f.path === declared || f.previousPath === declared);
      if (match !== void 0) return verdictOf("pass", match.path);
      return unverifiable2(truncated ? "file_list_truncated" : "declared_item_not_among_candidates");
    }
    case "commit": {
      const sha = declared.toLowerCase();
      const match = /^[0-9a-f]{7,40}$/.test(sha) ? relevant.find((c) => c.id.startsWith(sha)) : void 0;
      return match === void 0 ? unverifiable2("declared_item_not_among_candidates") : verdictOf("pass", match.id);
    }
    case "timeline_event": {
      const ref = declared;
      const events = observed;
      const match = ISSUE_REF.test(ref) ? events.find((e) => e.ref !== void 0 && sameIssue(qualifyIssue(ref, repository), e.ref)) : void 0;
      return match === void 0 ? unverifiable2("declared_item_not_among_candidates") : verdictOf("pass", { event: match.event, ref: match.ref ?? null });
    }
    case "check_run": {
      const runs = observed;
      let succeeded;
      if (runs.some((r) => r.status === "completed" && r.conclusion !== "success"))
        succeeded = false;
      else if (runs.some((r) => r.status !== "completed")) succeeded = void 0;
      else succeeded = true;
      if (succeeded === void 0) return unverifiable2("checks_incomplete");
      return succeeded === declared ? verdictOf("pass", succeeded) : verdictOf("fail", succeeded, "all_succeeded_mismatch");
    }
    case "test": {
      const tests = observed;
      const executed = tests.filter((t) => t.outcome !== "skipped");
      if (executed.length === 0) return unverifiable2("test_not_executed");
      const passed = executed.every((t) => t.outcome === "passed");
      return passed === declared ? verdictOf("pass", passed) : verdictOf("fail", passed, "test_outcome_mismatch");
    }
  }
}
function readReaderClaim(input2, evidence, repository) {
  const type = READER_CLAIM_KINDS.get(input2.kind);
  const opts = type === void 0 ? { repository } : { repository, types: [type] };
  const candidates = retrieve(
    { text: input2.text, declaredValue: input2.declaredValue },
    recordItems(evidence),
    opts
  );
  const claim = {
    text: input2.text,
    kind: input2.kind,
    declaredValue: input2.declaredValue,
    reader: { name: input2.reader.name, version: input2.reader.version },
    retrieval: { arm: ARM_A, floor: BM25_FLOOR },
    candidates,
    ...checkReaderClaim(
      { kind: input2.kind, declaredValue: input2.declaredValue, candidates },
      evidence,
      repository
    )
  };
  if (input2.probability !== void 0) claim.probability = input2.probability;
  return claim;
}

// src/record/build.ts
function recordBlock(extract) {
  switch (extract.status) {
    case "found":
      return { status: "found", sha256: extract.sha256, value: extract.value };
    case "missing":
      return { status: "missing", reason: "block_missing", sha256: null, value: null };
    case "ambiguous":
      return {
        status: "ambiguous",
        reason: "block_ambiguous",
        count: extract.count,
        sha256: null,
        value: null
      };
    case "invalid":
      return {
        status: "invalid",
        reason: "block_invalid",
        errors: extract.errors.map((e) => {
          const error = { code: e.code };
          if (e.pointer !== void 0) error.pointer = e.pointer;
          if (e.keyword !== void 0) error.keyword = e.keyword;
          return error;
        }),
        sha256: null,
        value: null
      };
  }
}
function claimsFor(block, evidence, repository) {
  return block.status === "found" ? runChecks(block.value, evidence, repository) : [];
}
function statementSubjects(block, subject) {
  const subjects = [
    {
      name: `git+https://github.com/${subject.repository}@${subject.headSha}`,
      digest: { gitCommit: subject.headSha }
    }
  ];
  if (block.status === "found") {
    subjects.push({ name: BLOCK_SUBJECT_NAME, digest: { sha256: block.sha256 } });
  }
  return subjects;
}
function rerunCommands(recordFile) {
  return { offline: `dunstan verify ${recordFile}`, online: `dunstan rerun ${recordFile}` };
}
function readerClaimsDigest(readerClaims) {
  return sha256Canonical(readerClaims);
}
function buildRecord(input2) {
  const { evidence, block, repository } = input2;
  const pr = evidence.pullRequest;
  const subject = {
    repository,
    pullRequest: pr.number,
    headSha: pr.headSha,
    mergeSha: pr.mergeSha
  };
  const claims = claimsFor(block, evidence, repository);
  const readerClaims = input2.readerClaims?.map((c) => readReaderClaim(c, evidence, repository));
  const advisory = input2.advisory === void 0 ? void 0 : advisorySection(input2.advisory, evidence, repository);
  const record = {
    _type: STATEMENT_TYPE,
    subject: statementSubjects(block, subject),
    predicateType: PREDICATE_TYPE,
    predicate: {
      spec: SPEC_VERSION,
      checker: input2.checker,
      report: input2.report,
      block,
      subject,
      evidence,
      claims,
      verdict: overallVerdict(block.status, claims),
      digests: {
        claims: claimsDigest(claims),
        evidence: evidenceDigest(evidence)
      },
      rerun: input2.rerun,
      assurance: input2.assurance ?? { status: "unsigned", issuer: "self-generated" }
    }
  };
  if (readerClaims !== void 0 || advisory !== void 0) {
    record.predicateType = DRAFT_PREDICATE_TYPE;
    record.predicate.spec = DRAFT_SPEC_VERSION;
  }
  if (readerClaims !== void 0) {
    record.predicate.readerClaims = readerClaims;
    record.predicate.digests.readerClaims = readerClaimsDigest(readerClaims);
  }
  if (advisory !== void 0) {
    record.predicate.advisory = advisory;
    record.predicate.digests.advisory = advisoryDigest(advisory);
  }
  return record;
}
function serializeRecord(record) {
  return record.predicate.assurance.status === "signed" ? canonicalize(record) : `${JSON.stringify(record, null, 2)}
`;
}

// src/spec/schema.ts
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);

// src/spec/schema-files.ts
var FILES = { "handback-block-0.1.schema.json": `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://barglabs.ai/dunstan/spec/schema/handback-block-0.1.schema.json",
  "title": "Dunstan handback block, v0.1",
  "description": "The declared block a completion report carries inside a fenced code block whose info string is exactly dunstan-handback. See spec/claim-format.md.",
  "type": "object",
  "required": ["dunstan", "headCommit", "filesChanged"],
  "additionalProperties": false,
  "properties": {
    "dunstan": {
      "description": "The spec version the block is written to, major.minor.",
      "const": "0.1"
    },
    "headCommit": {
      "$ref": "#/$defs/commitSha"
    },
    "filesChanged": {
      "type": "array",
      "uniqueItems": true,
      "items": { "$ref": "#/$defs/repoPath" }
    },
    "tests": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/testRun" }
    },
    "checks": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": false,
      "properties": {
        "total": { "type": "integer", "minimum": 0 },
        "allSucceeded": { "type": "boolean" }
      }
    },
    "references": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/reference" }
    },
    "mergedAt": {
      "$ref": "#/$defs/utcTimestamp"
    },
    "deployedAt": {
      "type": "object",
      "required": ["at", "environment"],
      "additionalProperties": false,
      "properties": {
        "at": { "$ref": "#/$defs/utcTimestamp" },
        "environment": { "type": "string", "minLength": 1, "maxLength": 255 }
      }
    }
  },
  "$defs": {
    "commitSha": {
      "description": "A full 40-character lowercase hexadecimal Git commit id.",
      "type": "string",
      "pattern": "^[0-9a-f]{40}$"
    },
    "repoPath": {
      "description": "A repository-relative path: segments separated by '/', none empty, none '.' or '..', no leading or trailing '/'.",
      "type": "string",
      "pattern": "^(?:[^/\\\\u0000]{3,}|[^/.\\\\u0000][^/\\\\u0000]?|\\\\.[^/.\\\\u0000])(?:/(?:[^/\\\\u0000]{3,}|[^/.\\\\u0000][^/\\\\u0000]?|\\\\.[^/.\\\\u0000]))*$"
    },
    "utcTimestamp": {
      "description": "An RFC 3339 timestamp in UTC, written with a Z offset.",
      "type": "string",
      "format": "date-time",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\\\.[0-9]+)?Z$"
    },
    "count": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "testRun": {
      "type": "object",
      "required": ["command", "count", "record"],
      "additionalProperties": false,
      "properties": {
        "command": { "type": "string", "minLength": 1, "maxLength": 1000 },
        "count": { "$ref": "#/$defs/count" },
        "failures": { "$ref": "#/$defs/count" },
        "record": { "$ref": "#/$defs/testRecord" }
      }
    },
    "testRecord": {
      "description": "Names the machine-readable test record a count is compared with. v0.1 defines the junit kind. Any other kind is legal and yields an unverifiable claim.",
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind": { "type": "string", "minLength": 1, "maxLength": 100 }
      },
      "if": {
        "properties": { "kind": { "const": "junit" } }
      },
      "then": { "$ref": "#/$defs/junitRecord" }
    },
    "junitRecord": {
      "type": "object",
      "required": ["kind", "workflow", "job", "artifact", "path"],
      "additionalProperties": false,
      "properties": {
        "kind": { "const": "junit" },
        "workflow": {
          "description": "The workflow file's path from the repository root, for example .github/workflows/ci.yml.",
          "$ref": "#/$defs/repoPath"
        },
        "job": {
          "description": "The job's name as the workflow run records it.",
          "type": "string",
          "minLength": 1,
          "maxLength": 255
        },
        "artifact": {
          "description": "The name of the artifact the run uploaded.",
          "type": "string",
          "minLength": 1,
          "maxLength": 255
        },
        "path": {
          "description": "The JUnit XML file's path inside the artifact.",
          "$ref": "#/$defs/repoPath"
        }
      }
    },
    "reference": {
      "oneOf": [
        {
          "type": "object",
          "required": ["issue", "relation"],
          "additionalProperties": false,
          "properties": {
            "issue": {
              "description": "#N in the subject repository, or owner/repo#N.",
              "type": "string",
              "pattern": "^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9}$"
            },
            "relation": { "enum": ["closes", "cites"] }
          }
        },
        {
          "type": "object",
          "required": ["commit", "relation"],
          "additionalProperties": false,
          "properties": {
            "commit": { "$ref": "#/$defs/commitSha" },
            "relation": { "const": "cites" }
          }
        }
      ]
    }
  }
}
`, "record-0.1.schema.json": `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://barglabs.ai/dunstan/spec/schema/record-0.1.schema.json",
  "title": "Dunstan record, v0.1",
  "description": "An in-toto Statement v1 whose predicate records one check of a handback block against the record. See spec/claim-format.md.",
  "type": "object",
  "required": ["_type", "subject", "predicateType", "predicate"],
  "additionalProperties": false,
  "properties": {
    "_type": { "const": "https://in-toto.io/Statement/v1" },
    "subject": {
      "type": "array",
      "minItems": 1,
      "maxItems": 2,
      "prefixItems": [{ "$ref": "#/$defs/commitSubject" }, { "$ref": "#/$defs/blockSubject" }],
      "items": false
    },
    "predicateType": { "const": "https://barglabs.ai/dunstan/record/v0.1" },
    "predicate": { "$ref": "#/$defs/predicate" }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "predicate": {
            "properties": { "block": { "properties": { "status": { "const": "found" } } } }
          }
        }
      },
      "then": { "properties": { "subject": { "minItems": 2 } } },
      "else": { "properties": { "subject": { "maxItems": 1 } } }
    }
  ],
  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "commitSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "repository": {
      "description": "owner/repo",
      "type": "string",
      "pattern": "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$"
    },
    "issueRef": {
      "description": "owner/repo#N, always fully qualified in evidence.",
      "type": "string",
      "pattern": "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}#[1-9][0-9]{0,9}$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\\\.[0-9]+)?Z$"
    },
    "sourceKind": {
      "enum": [
        "pull_request",
        "pull_request_files",
        "closing_references",
        "repository",
        "issue",
        "commit",
        "compare",
        "check_runs",
        "workflow_runs",
        "artifact",
        "deployments"
      ]
    },
    "commitSubject": {
      "type": "object",
      "required": ["name", "digest"],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "pattern": "^git\\\\+https://github\\\\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}@[0-9a-f]{40}$"
        },
        "digest": {
          "type": "object",
          "required": ["gitCommit"],
          "additionalProperties": false,
          "properties": { "gitCommit": { "$ref": "#/$defs/commitSha" } }
        }
      }
    },
    "blockSubject": {
      "type": "object",
      "required": ["name", "digest"],
      "additionalProperties": false,
      "properties": {
        "name": { "const": "handback-block" },
        "digest": {
          "type": "object",
          "required": ["sha256"],
          "additionalProperties": false,
          "properties": { "sha256": { "$ref": "#/$defs/sha256" } }
        }
      }
    },
    "predicate": {
      "type": "object",
      "required": [
        "spec",
        "checker",
        "report",
        "block",
        "subject",
        "evidence",
        "claims",
        "verdict",
        "digests",
        "rerun",
        "assurance"
      ],
      "additionalProperties": false,
      "properties": {
        "spec": {
          "description": "The spec version the checker implements, semver.",
          "type": "string",
          "pattern": "^0\\\\.1\\\\.(?:0|[1-9][0-9]*)$"
        },
        "checker": {
          "type": "object",
          "required": ["name", "version", "digest"],
          "additionalProperties": false,
          "properties": {
            "name": { "type": "string", "minLength": 1, "maxLength": 214 },
            "version": { "type": "string", "minLength": 1, "maxLength": 100 },
            "digest": {
              "type": "object",
              "required": ["sha256"],
              "additionalProperties": false,
              "properties": { "sha256": { "$ref": "#/$defs/sha256" } }
            }
          }
        },
        "report": {
          "description": "The report's digest and where it was read. Never its text.",
          "type": "object",
          "required": ["sha256", "source"],
          "additionalProperties": false,
          "properties": {
            "sha256": { "$ref": "#/$defs/sha256" },
            "source": {
              "type": "object",
              "required": ["kind", "locator"],
              "additionalProperties": false,
              "properties": {
                "kind": { "enum": ["pr-body", "pr-comment", "file", "stdin", "api"] },
                "locator": { "type": "string", "minLength": 1, "maxLength": 2000 }
              }
            }
          }
        },
        "block": { "$ref": "#/$defs/block" },
        "subject": {
          "type": "object",
          "required": ["repository", "pullRequest", "headSha", "mergeSha"],
          "additionalProperties": false,
          "properties": {
            "repository": { "$ref": "#/$defs/repository" },
            "pullRequest": { "type": "integer", "minimum": 1 },
            "headSha": { "$ref": "#/$defs/commitSha" },
            "mergeSha": {
              "oneOf": [{ "$ref": "#/$defs/commitSha" }, { "type": "null" }]
            }
          }
        },
        "evidence": { "$ref": "#/$defs/evidence" },
        "claims": {
          "type": "array",
          "items": { "$ref": "#/$defs/claim" }
        },
        "verdict": { "$ref": "#/$defs/verdict" },
        "digests": {
          "type": "object",
          "required": ["claims", "evidence"],
          "additionalProperties": false,
          "properties": {
            "claims": { "$ref": "#/$defs/sha256" },
            "evidence": { "$ref": "#/$defs/sha256" }
          }
        },
        "rerun": {
          "type": "object",
          "required": ["offline", "online"],
          "additionalProperties": false,
          "properties": {
            "offline": { "type": "string", "minLength": 1, "maxLength": 2000 },
            "online": { "type": "string", "minLength": 1, "maxLength": 2000 }
          }
        },
        "assurance": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "issuer"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "unsigned" },
                "issuer": { "const": "self-generated" }
              }
            },
            {
              "type": "object",
              "required": ["status", "issuer", "keyFingerprint"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "signed" },
                "issuer": { "type": "string", "minLength": 1, "maxLength": 320 },
                "keyFingerprint": { "type": "string", "pattern": "^SHA256:[A-Za-z0-9+/]{43}$" }
              }
            }
          ]
        }
      }
    },
    "verdict": { "enum": ["pass", "fail", "unverifiable"] },
    "blockError": {
      "type": "object",
      "required": ["code"],
      "additionalProperties": false,
      "properties": {
        "code": {
          "enum": [
            "unterminated_fence",
            "invalid_json",
            "duplicate_member",
            "unsupported_version",
            "schema_violation"
          ]
        },
        "pointer": { "type": "string", "pattern": "^(?:/.*)?$" },
        "keyword": { "type": "string", "minLength": 1 }
      }
    },
    "block": {
      "oneOf": [
        {
          "type": "object",
          "required": ["status", "sha256", "value"],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "found" },
            "sha256": { "$ref": "#/$defs/sha256" },
            "value": { "$ref": "handback-block-0.1.schema.json" }
          }
        },
        {
          "type": "object",
          "required": ["status", "reason", "sha256", "value"],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "missing" },
            "reason": { "const": "block_missing" },
            "sha256": { "type": "null" },
            "value": { "type": "null" }
          }
        },
        {
          "type": "object",
          "required": ["status", "reason", "count", "sha256", "value"],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "ambiguous" },
            "reason": { "const": "block_ambiguous" },
            "count": { "type": "integer", "minimum": 2 },
            "sha256": { "type": "null" },
            "value": { "type": "null" }
          }
        },
        {
          "type": "object",
          "required": ["status", "reason", "errors", "sha256", "value"],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "invalid" },
            "reason": { "const": "block_invalid" },
            "errors": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/blockError" } },
            "sha256": { "type": "null" },
            "value": { "type": "null" }
          }
        }
      ]
    },
    "claim": {
      "type": "object",
      "required": ["id", "check", "field", "declared", "observed", "verdict"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "check": { "enum": ["head", "scope", "reference", "count", "time"] },
        "field": {
          "description": "A JSON Pointer (RFC 6901) into the block.",
          "type": "string",
          "pattern": "^/.+$"
        },
        "declared": true,
        "observed": true,
        "verdict": { "$ref": "#/$defs/verdict" },
        "reason": { "$ref": "#/$defs/claimReason" }
      },
      "if": { "properties": { "verdict": { "const": "pass" } } },
      "then": { "not": { "required": ["reason"] } },
      "else": { "required": ["reason"] }
    },
    "claimReason": {
      "type": "string",
      "pattern": "^(?:head_mismatch|declared_not_changed|undeclared_file|file_list_truncated|not_closing|not_found|not_reachable|count_mismatch|all_succeeded_mismatch|checks_incomplete|no_check_runs|no_comparable_record_field|record_not_found|record_ambiguous|not_merged|premature|no_deployment|evidence_field_unpopulated:[A-Za-z0-9_.]+|source_unreadable:(?:pull_request|pull_request_files|closing_references|repository|issue|commit|compare|check_runs|workflow_runs|artifact|deployments))$"
    },
    "unread": {
      "description": "A section the checker could not use: its source errored, or the source answered without the field.",
      "oneOf": [
        {
          "type": "object",
          "required": ["status", "source"],
          "properties": {
            "status": { "const": "unreadable" },
            "source": { "$ref": "#/$defs/sourceKind" }
          }
        },
        {
          "type": "object",
          "required": ["status", "field"],
          "properties": {
            "status": { "const": "unpopulated" },
            "field": { "type": "string", "pattern": "^[A-Za-z0-9_.]+$" }
          }
        }
      ]
    },
    "evidence": {
      "type": "object",
      "required": ["pullRequest", "sources"],
      "additionalProperties": false,
      "properties": {
        "pullRequest": {
          "description": "Always read: a checker that cannot read the pull request writes no record.",
          "type": "object",
          "required": [
            "status",
            "number",
            "state",
            "merged",
            "mergedAt",
            "headSha",
            "mergeSha",
            "changedFiles"
          ],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "ok" },
            "number": { "type": "integer", "minimum": 1 },
            "state": { "enum": ["open", "closed"] },
            "merged": { "type": "boolean" },
            "mergedAt": { "oneOf": [{ "$ref": "#/$defs/timestamp" }, { "type": "null" }] },
            "headSha": { "$ref": "#/$defs/commitSha" },
            "mergeSha": { "oneOf": [{ "$ref": "#/$defs/commitSha" }, { "type": "null" }] },
            "changedFiles": { "type": "integer", "minimum": 0 }
          }
        },
        "files": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "complete", "entries"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "ok" },
                "complete": { "type": "boolean" },
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["path", "status"],
                    "additionalProperties": false,
                    "properties": {
                      "path": { "type": "string", "minLength": 1 },
                      "status": {
                        "enum": [
                          "added",
                          "removed",
                          "modified",
                          "renamed",
                          "copied",
                          "changed",
                          "unchanged"
                        ]
                      },
                      "previousPath": { "type": "string", "minLength": 1 }
                    }
                  }
                }
              }
            },
            { "$ref": "#/$defs/unreadOnly" }
          ]
        },
        "closingReferences": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "issues"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "ok" },
                "issues": { "type": "array", "items": { "$ref": "#/$defs/issueRef" } }
              }
            },
            { "$ref": "#/$defs/unreadOnly" }
          ]
        },
        "references": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "object",
                "required": ["kind", "ref", "status", "exists"],
                "additionalProperties": false,
                "properties": {
                  "kind": { "const": "issue" },
                  "ref": { "$ref": "#/$defs/issueRef" },
                  "status": { "const": "ok" },
                  "exists": { "type": "boolean" }
                }
              },
              {
                "type": "object",
                "required": ["kind", "ref", "status", "exists", "reachableFromHead"],
                "additionalProperties": false,
                "properties": {
                  "kind": { "const": "commit" },
                  "ref": { "$ref": "#/$defs/commitSha" },
                  "status": { "const": "ok" },
                  "exists": { "type": "boolean" },
                  "reachableFromHead": { "type": "boolean" }
                }
              },
              {
                "type": "object",
                "required": ["kind", "ref"],
                "properties": {
                  "kind": { "enum": ["issue", "commit"] },
                  "ref": { "type": "string", "minLength": 1 }
                },
                "allOf": [{ "$ref": "#/$defs/unread" }]
              }
            ]
          }
        },
        "checkRuns": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "commit", "excludedIds", "runs"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "ok" },
                "commit": { "$ref": "#/$defs/commitSha" },
                "excludedIds": {
                  "description": "Check runs left out of the count: the run the checker itself executes in.",
                  "type": "array",
                  "items": { "type": "integer", "minimum": 1 }
                },
                "runs": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["id", "name", "status", "conclusion"],
                    "additionalProperties": false,
                    "properties": {
                      "id": { "type": "integer", "minimum": 1 },
                      "name": { "type": "string" },
                      "status": { "type": "string", "minLength": 1 },
                      "conclusion": { "type": ["string", "null"] }
                    }
                  }
                }
              }
            },
            { "$ref": "#/$defs/unreadOnly" }
          ]
        },
        "testRecords": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "object",
                "required": ["record", "status", "runs"],
                "additionalProperties": false,
                "properties": {
                  "record": { "$ref": "handback-block-0.1.schema.json#/$defs/junitRecord" },
                  "status": { "const": "ok" },
                  "runs": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["runId", "runAttempt", "executed", "failed"],
                      "additionalProperties": false,
                      "properties": {
                        "runId": { "type": "integer", "minimum": 1 },
                        "runAttempt": { "type": "integer", "minimum": 1 },
                        "executed": { "type": "integer", "minimum": 0 },
                        "failed": { "type": "integer", "minimum": 0 }
                      }
                    }
                  }
                }
              },
              {
                "type": "object",
                "required": ["record"],
                "properties": {
                  "record": { "$ref": "handback-block-0.1.schema.json#/$defs/junitRecord" }
                },
                "allOf": [{ "$ref": "#/$defs/unread" }]
              }
            ]
          }
        },
        "deployments": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "object",
                "required": ["environment", "status", "deployments"],
                "additionalProperties": false,
                "properties": {
                  "environment": { "type": "string", "minLength": 1 },
                  "status": { "const": "ok" },
                  "deployments": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["id", "sha", "relation", "successAt"],
                      "additionalProperties": false,
                      "properties": {
                        "id": { "type": "integer", "minimum": 1 },
                        "sha": { "$ref": "#/$defs/commitSha" },
                        "relation": {
                          "enum": ["head", "merge", "descendant", "unrelated", "unknown"]
                        },
                        "successAt": {
                          "oneOf": [{ "$ref": "#/$defs/timestamp" }, { "type": "null" }]
                        }
                      }
                    }
                  }
                }
              },
              {
                "type": "object",
                "required": ["environment"],
                "properties": { "environment": { "type": "string", "minLength": 1 } },
                "allOf": [{ "$ref": "#/$defs/unread" }]
              }
            ]
          }
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["kind", "locator", "sha256", "readAt"],
            "additionalProperties": false,
            "properties": {
              "kind": { "$ref": "#/$defs/sourceKind" },
              "locator": { "type": "string", "minLength": 1, "maxLength": 2000 },
              "sha256": { "$ref": "#/$defs/sha256" },
              "etag": { "type": "string", "minLength": 1 },
              "readAt": { "$ref": "#/$defs/timestamp" },
              "error": {
                "description": "Present when the read failed: http_<status>, network, or parse.",
                "type": "string",
                "pattern": "^(?:http_[1-5][0-9]{2}|network|parse)$"
              }
            }
          }
        }
      }
    },
    "unreadOnly": {
      "allOf": [{ "$ref": "#/$defs/unread" }],
      "unevaluatedProperties": false
    }
  }
}
`, "record-0.2-draft.schema.json": `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://barglabs.ai/dunstan/spec/schema/record-0.2-draft.schema.json",
  "title": "Dunstan record, DRAFT 0.2.0",
  "description": "DRAFT, not normative, for the operator to check (spec/claim-format.md, \\"DRAFT 0.2.0\\"). A 0.1 record plus an optional readerClaims member and an evidence items section. Every member it shares with 0.1 is a reference into record-0.1.schema.json, which this file does not change.",
  "type": "object",
  "required": ["_type", "subject", "predicateType", "predicate"],
  "additionalProperties": false,
  "properties": {
    "_type": { "$ref": "record-0.1.schema.json#/properties/_type" },
    "subject": { "$ref": "record-0.1.schema.json#/properties/subject" },
    "predicateType": { "const": "https://barglabs.ai/dunstan/record/v0.2-draft" },
    "predicate": { "$ref": "#/$defs/predicate" }
  },
  "allOf": [{ "$ref": "record-0.1.schema.json#/allOf/0" }],
  "$defs": {
    "predicate": {
      "type": "object",
      "required": [
        "spec",
        "checker",
        "report",
        "block",
        "subject",
        "evidence",
        "claims",
        "verdict",
        "digests",
        "rerun",
        "assurance"
      ],
      "additionalProperties": false,
      "properties": {
        "spec": { "const": "0.2.0-draft" },
        "checker": { "$ref": "record-0.1.schema.json#/$defs/predicate/properties/checker" },
        "report": { "$ref": "record-0.1.schema.json#/$defs/predicate/properties/report" },
        "block": { "$ref": "record-0.1.schema.json#/$defs/block" },
        "subject": { "$ref": "record-0.1.schema.json#/$defs/predicate/properties/subject" },
        "evidence": { "$ref": "#/$defs/evidence" },
        "claims": { "$ref": "record-0.1.schema.json#/$defs/predicate/properties/claims" },
        "verdict": { "$ref": "record-0.1.schema.json#/$defs/verdict" },
        "readerClaims": {
          "description": "Typed claims a reader extracted from a prose report, each with the candidate record items retrieval proposed and the check's verdict. They do not enter the record's verdict in this draft.",
          "type": "array",
          "items": { "$ref": "#/$defs/readerClaim" }
        },
        "advisory": { "$ref": "#/$defs/advisory" },
        "digests": {
          "type": "object",
          "required": ["claims", "evidence"],
          "additionalProperties": false,
          "properties": {
            "claims": { "$ref": "record-0.1.schema.json#/$defs/sha256" },
            "evidence": { "$ref": "record-0.1.schema.json#/$defs/sha256" },
            "readerClaims": { "$ref": "record-0.1.schema.json#/$defs/sha256" },
            "advisory": { "$ref": "record-0.1.schema.json#/$defs/sha256" }
          }
        },
        "rerun": { "$ref": "record-0.1.schema.json#/$defs/predicate/properties/rerun" },
        "assurance": { "$ref": "record-0.1.schema.json#/$defs/predicate/properties/assurance" }
      },
      "dependentSchemas": {
        "readerClaims": {
          "properties": { "digests": { "required": ["readerClaims"] } }
        },
        "advisory": {
          "properties": { "digests": { "required": ["advisory"] } }
        }
      }
    },
    "evidence": {
      "type": "object",
      "required": ["pullRequest", "sources"],
      "additionalProperties": false,
      "properties": {
        "pullRequest": {
          "$ref": "record-0.1.schema.json#/$defs/evidence/properties/pullRequest"
        },
        "files": { "$ref": "record-0.1.schema.json#/$defs/evidence/properties/files" },
        "closingReferences": {
          "$ref": "record-0.1.schema.json#/$defs/evidence/properties/closingReferences"
        },
        "references": { "$ref": "record-0.1.schema.json#/$defs/evidence/properties/references" },
        "checkRuns": { "$ref": "record-0.1.schema.json#/$defs/evidence/properties/checkRuns" },
        "testRecords": {
          "$ref": "record-0.1.schema.json#/$defs/evidence/properties/testRecords"
        },
        "deployments": {
          "$ref": "record-0.1.schema.json#/$defs/evidence/properties/deployments"
        },
        "items": { "$ref": "#/$defs/items" },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["kind", "locator", "sha256", "readAt"],
            "additionalProperties": false,
            "properties": {
              "kind": { "$ref": "#/$defs/sourceKind" },
              "locator": { "type": "string", "minLength": 1, "maxLength": 2000 },
              "sha256": { "$ref": "record-0.1.schema.json#/$defs/sha256" },
              "etag": { "type": "string", "minLength": 1 },
              "readAt": { "$ref": "record-0.1.schema.json#/$defs/timestamp" },
              "error": {
                "type": "string",
                "pattern": "^(?:http_[1-5][0-9]{2}|network|parse)$"
              }
            }
          }
        }
      }
    },
    "sourceKind": {
      "description": "The 0.1 source kinds, plus the two reads the items section adds.",
      "anyOf": [
        { "$ref": "record-0.1.schema.json#/$defs/sourceKind" },
        { "enum": ["pull_request_commits", "timeline"] }
      ]
    },
    "itemsUnread": {
      "oneOf": [
        {
          "type": "object",
          "required": ["status", "source"],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "unreadable" },
            "source": { "enum": ["pull_request_commits", "timeline", "artifact"] }
          }
        },
        {
          "type": "object",
          "required": ["status", "field"],
          "additionalProperties": false,
          "properties": {
            "status": { "const": "unpopulated" },
            "field": { "type": "string", "pattern": "^[A-Za-z0-9_.]+$" }
          }
        }
      ]
    },
    "items": {
      "description": "The record items a reader claim can be about that the 0.1 sections do not list. Changed files and check runs come from files and checkRuns.",
      "type": "object",
      "required": ["commits", "timeline", "tests"],
      "additionalProperties": false,
      "properties": {
        "commits": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "entries"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "ok" },
                "entries": {
                  "description": "The pull request's commits, in the order the API lists them.",
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["sha", "headline"],
                    "additionalProperties": false,
                    "properties": {
                      "sha": { "$ref": "record-0.1.schema.json#/$defs/commitSha" },
                      "headline": { "type": "string", "maxLength": 1000 }
                    }
                  }
                }
              }
            },
            { "$ref": "#/$defs/itemsUnread" }
          ]
        },
        "timeline": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "entries"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "ok" },
                "entries": {
                  "description": "The pull request's timeline events, in the order the API lists them.",
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["id", "event"],
                    "additionalProperties": false,
                    "properties": {
                      "id": { "type": "string", "minLength": 1, "maxLength": 200 },
                      "event": { "type": "string", "minLength": 1, "maxLength": 100 },
                      "ref": {
                        "oneOf": [
                          { "$ref": "record-0.1.schema.json#/$defs/issueRef" },
                          { "$ref": "record-0.1.schema.json#/$defs/commitSha" }
                        ]
                      },
                      "detail": { "type": "string", "minLength": 1, "maxLength": 200 }
                    }
                  }
                }
              }
            },
            { "$ref": "#/$defs/itemsUnread" }
          ]
        },
        "tests": {
          "oneOf": [
            {
              "type": "object",
              "required": ["status", "entries"],
              "additionalProperties": false,
              "properties": {
                "status": { "const": "ok" },
                "entries": {
                  "description": "The test cases of one JUnit record, in code-unit order of classname.name, one entry each.",
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "outcome"],
                    "additionalProperties": false,
                    "properties": {
                      "name": { "type": "string", "minLength": 1, "maxLength": 1000 },
                      "classname": { "type": "string", "minLength": 1, "maxLength": 1000 },
                      "outcome": { "enum": ["passed", "failed", "skipped"] }
                    }
                  }
                }
              }
            },
            { "$ref": "#/$defs/itemsUnread" }
          ]
        }
      }
    },
    "candidate": {
      "type": "object",
      "required": ["type", "id", "score", "matchedField"],
      "additionalProperties": false,
      "properties": {
        "type": { "enum": ["commit", "timeline_event", "check_run", "file", "test"] },
        "id": { "type": "string", "minLength": 1 },
        "score": {
          "description": "null for an exact identifier match; otherwise the BM25 score, rounded to 6 places. It ranks candidates and is read by no check.",
          "oneOf": [{ "type": "number", "minimum": 0 }, { "type": "null" }]
        },
        "matchedField": { "type": "string", "minLength": 1 }
      }
    },
    "readerClaim": {
      "type": "object",
      "required": [
        "text",
        "kind",
        "declaredValue",
        "reader",
        "retrieval",
        "candidates",
        "observed",
        "verdict"
      ],
      "additionalProperties": false,
      "properties": {
        "text": { "type": "string", "minLength": 1, "maxLength": 2000 },
        "kind": { "type": "string", "pattern": "^[a-z][a-z0-9_]{0,63}$" },
        "declaredValue": true,
        "reader": {
          "type": "object",
          "required": ["name", "version"],
          "additionalProperties": false,
          "properties": {
            "name": { "type": "string", "minLength": 1, "maxLength": 214 },
            "version": { "type": "string", "minLength": 1, "maxLength": 100 }
          }
        },
        "probability": {
          "description": "The reader's output, recorded as given. Never read by a check.",
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "retrieval": {
          "type": "object",
          "required": ["arm", "floor"],
          "additionalProperties": false,
          "properties": {
            "arm": { "const": "A" },
            "floor": { "type": "number", "minimum": 0 }
          }
        },
        "candidates": { "type": "array", "items": { "$ref": "#/$defs/candidate" } },
        "observed": true,
        "verdict": { "$ref": "record-0.1.schema.json#/$defs/verdict" },
        "reason": { "$ref": "#/$defs/readerReason" }
      },
      "if": { "properties": { "verdict": { "const": "pass" } } },
      "then": { "not": { "required": ["reason"] } },
      "else": { "required": ["reason"] }
    },
    "advisory": {
      "description": "Claims the advisory extractor proposed from the report's prose, each compared with the evidence by a 0.1 gate check. Advisories never enter the record's verdict or claims, and none is a fail (spec/claim-format.md, \\"DRAFT 0.2.0\\", D.11).",
      "type": "object",
      "required": ["extractor", "comparison", "precision", "differsAccuracy", "advisories"],
      "additionalProperties": false,
      "properties": {
        "comparison": {
          "description": "The version of the rules that turn a proposed claim and the evidence into its note, separate from the extractor's. 0.1.0 compared a file claim by exact path only; 0.2.0 also matches it by name (D.11.4).",
          "type": "object",
          "required": ["version"],
          "additionalProperties": false,
          "properties": { "version": { "type": "string", "minLength": 1, "maxLength": 100 } }
        },
        "extractor": {
          "type": "object",
          "required": ["version", "digest"],
          "additionalProperties": false,
          "properties": {
            "version": { "type": "string", "minLength": 1, "maxLength": 100 },
            "digest": {
              "description": "SHA-256 over the JCS bytes of the extractor's written grammar.",
              "type": "object",
              "required": ["sha256"],
              "additionalProperties": false,
              "properties": { "sha256": { "$ref": "record-0.1.schema.json#/$defs/sha256" } }
            }
          }
        },
        "precision": {
          "description": "The extractor's precision from a published measurement of this very grammar, or null: unmeasured.",
          "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/advisoryFigure" }]
        },
        "differsAccuracy": {
          "description": "The share of differs notes that marked a genuinely false claim, from a published measurement of this very grammar and this very comparison, with the corpus's base rate beside it; or null: unmeasured.",
          "oneOf": [
            { "type": "null" },
            {
              "$ref": "#/$defs/advisoryFigureFields",
              "required": ["baseRate"],
              "properties": { "baseRate": { "$ref": "#/$defs/advisoryFigure" } },
              "unevaluatedProperties": false
            }
          ]
        },
        "advisories": { "type": "array", "items": { "$ref": "#/$defs/advisoryItem" } }
      }
    },
    "advisoryFigure": {
      "$ref": "#/$defs/advisoryFigureFields",
      "unevaluatedProperties": false
    },
    "advisoryFigureFields": {
      "description": "A published measurement of the advisory layer: a share, how many items it is over, its interval, the corpus size, how the items were drawn and adjudicated, and who adjudicated on what and when. Never a row, a clause or a label.",
      "type": "object",
      "required": ["value", "n", "interval", "pullRequests", "method", "source"],
      "properties": {
        "value": { "type": "number", "minimum": 0, "maximum": 1 },
        "n": { "type": "integer", "minimum": 1 },
        "interval": {
          "type": "object",
          "required": ["method", "level", "low", "high"],
          "additionalProperties": false,
          "properties": {
            "method": { "const": "wilson" },
            "level": { "const": 0.95 },
            "low": { "type": "number", "minimum": 0, "maximum": 1 },
            "high": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        },
        "pullRequests": { "type": "integer", "minimum": 1 },
        "method": { "type": "string", "minLength": 1, "maxLength": 2000 },
        "source": { "type": "string", "minLength": 1, "maxLength": 2000 }
      }
    },
    "advisoryItem": {
      "type": "object",
      "required": ["clause", "kind", "value", "observed", "note"],
      "additionalProperties": false,
      "properties": {
        "clause": { "type": "string", "minLength": 1, "maxLength": 300 },
        "kind": {
          "enum": [
            "file_changed",
            "reference_closes",
            "commit",
            "head_commit",
            "checks_succeeded",
            "check_count",
            "tests_passed",
            "test_count",
            "merged_at"
          ]
        },
        "value": true,
        "observed": true,
        "note": { "$ref": "#/$defs/advisoryNote" }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "file_changed" } } },
          "then": {
            "properties": { "value": { "$ref": "handback-block-0.1.schema.json#/$defs/repoPath" } }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "reference_closes" } } },
          "then": {
            "properties": {
              "value": {
                "type": "string",
                "pattern": "^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9}$"
              }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "enum": ["commit", "head_commit"] } } },
          "then": {
            "properties": { "value": { "type": "string", "pattern": "^[0-9a-f]{7,40}$" } }
          }
        },
        {
          "if": { "properties": { "kind": { "enum": ["checks_succeeded", "tests_passed"] } } },
          "then": { "properties": { "value": { "type": "boolean" } } }
        },
        {
          "if": { "properties": { "kind": { "enum": ["check_count", "test_count"] } } },
          "then": { "properties": { "value": { "type": "integer", "minimum": 0 } } }
        },
        {
          "if": { "properties": { "kind": { "const": "merged_at" } } },
          "then": {
            "properties": { "value": { "$ref": "record-0.1.schema.json#/$defs/timestamp" } }
          }
        }
      ]
    },
    "advisoryNote": {
      "description": "agrees when the gate check would pass; differs:<reason> when it would fail; unanswered:<reason> when it would be unverifiable. The reasons are the 0.1 claim reasons. A file claim matched by name only is agrees_by_name, or unanswered:ambiguous_path when more than one changed path has that name (D.11.4). Never a verdict.",
      "type": "string",
      "pattern": "^(?:agrees|agrees_by_name|unanswered:ambiguous_path|(?:differs|unanswered):(?:head_mismatch|declared_not_changed|file_list_truncated|not_closing|not_found|not_reachable|count_mismatch|all_succeeded_mismatch|checks_incomplete|no_check_runs|no_comparable_record_field|not_merged|premature|evidence_field_unpopulated:[A-Za-z0-9_.]+|source_unreadable:(?:pull_request|pull_request_files|closing_references|repository|issue|commit|compare|check_runs)))$"
    },
    "readerReason": {
      "type": "string",
      "pattern": "^(?:no_matching_record_item|declared_item_not_among_candidates|candidate_not_in_evidence|no_comparable_record_field|file_list_truncated|checks_incomplete|all_succeeded_mismatch|test_not_executed|test_outcome_mismatch|evidence_field_unpopulated:[A-Za-z0-9_.]+|source_unreadable:(?:pull_request_files|check_runs|pull_request_commits|timeline|artifact))$"
    }
  }
}
` };
function schemaText(file) {
  const text = FILES[file];
  if (text === void 0) throw new Error(`no schema ${file} in this build`);
  return text;
}

// src/spec/schema-validators.ts
var PRECOMPILED = void 0;

// src/spec/schema.ts
var addFormats = import_ajv_formats.default.default;
var BLOCK_SCHEMA_FILE = "handback-block-0.1.schema.json";
var RECORD_SCHEMA_FILE = "record-0.1.schema.json";
function readSchema(file) {
  return JSON.parse(schemaText(file));
}
function schemaId(file) {
  return readSchema(file).$id;
}
function createAjv(extra = {}) {
  const ajv = new import__.Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictNumbers: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    ...extra
  });
  addFormats(ajv);
  ajv.addSchema(readSchema(BLOCK_SCHEMA_FILE));
  ajv.addSchema(readSchema(RECORD_SCHEMA_FILE));
  return ajv;
}
function compileValidators() {
  const ajv = createAjv();
  return {
    block: ajv.getSchema(schemaId(BLOCK_SCHEMA_FILE)),
    record: ajv.getSchema(schemaId(RECORD_SCHEMA_FILE))
  };
}
var validators;
function load() {
  validators ??= PRECOMPILED ?? compileValidators();
  return validators;
}
function toSchemaErrors(errors) {
  return (errors ?? []).map((e) => ({
    code: "schema_violation",
    pointer: e.instancePath,
    keyword: e.keyword,
    message: e.message ?? e.keyword
  }));
}
function validateBlock(value) {
  const validate = load().block;
  return validate(value) ? [] : toSchemaErrors(validate.errors);
}

// src/spec/extract.ts
var OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
function isClosingFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  const run = match?.[1];
  return run !== void 0 && run[0] === fence.char && run.length >= fence.length;
}
function scanHandbackBlocks(reportText) {
  const text = reportText.startsWith("\uFEFF") ? reportText.slice(1) : reportText;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let open;
  for (const line of lines) {
    if (open !== void 0) {
      if (isClosingFence(line, open)) {
        if (open.handback) blocks.push({ content: open.lines.join("\n"), terminated: true });
        open = void 0;
      } else if (open.handback) {
        open.lines.push(line);
      }
      continue;
    }
    const match = OPENING_FENCE.exec(line);
    const run = match?.[1];
    if (run === void 0) continue;
    const info = (match?.[2] ?? "").replace(/^[ \t]+|[ \t]+$/g, "");
    if (run[0] === "`" && info.includes("`")) continue;
    open = {
      char: run[0],
      length: run.length,
      handback: info === BLOCK_INFO_STRING,
      lines: []
    };
  }
  if (open?.handback) blocks.push({ content: open.lines.join("\n"), terminated: false });
  return blocks;
}
var VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
function versionSupported(version) {
  const [major, minor] = version.split(".");
  return SUPPORTED_BLOCK_VERSIONS.some((supported) => {
    const [sMajor, sMinor] = supported.split(".");
    return major === "0" ? major === sMajor && minor === sMinor : major === sMajor;
  });
}
function readBlockContent(content) {
  let value;
  try {
    value = parseStrictJson(content);
  } catch (e) {
    if (e instanceof JsonReadError) {
      const error = { code: e.code, message: e.message };
      if (e.pointer !== void 0) error.pointer = e.pointer;
      return { status: "invalid", errors: [error] };
    }
    throw e;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const declared = value.dunstan;
    if (typeof declared === "string" && VERSION.test(declared) && !versionSupported(declared)) {
      return {
        status: "invalid",
        errors: [
          {
            code: "unsupported_version",
            message: `block declares dunstan ${declared}; this checker implements ${SUPPORTED_BLOCK_VERSIONS.join(", ")}`,
            pointer: "/dunstan"
          }
        ]
      };
    }
  }
  const schemaErrors = validateBlock(value);
  if (schemaErrors.length > 0) return { status: "invalid", errors: schemaErrors };
  return { status: "found", value, sha256: sha256Canonical(value) };
}
function extractHandbackBlock(reportText) {
  const blocks = scanHandbackBlocks(reportText);
  if (blocks.length === 0) return { status: "missing" };
  if (blocks.length > 1) return { status: "ambiguous", count: blocks.length };
  const block = blocks[0];
  if (!block.terminated) {
    return {
      status: "invalid",
      errors: [
        { code: "unterminated_fence", message: "the dunstan-handback fence is never closed" }
      ]
    };
  }
  return readBlockContent(block.content);
}

// src/pipeline/check-pull-request.ts
function githubReaders(client) {
  return {
    pullRequest: (repository, number) => readPullRequest(client, repository, number),
    evidence: (input2) => readEvidence(client, input2)
  };
}
async function checkPullRequest(input2) {
  const pr = await input2.readers.pullRequest(input2.repository, input2.number);
  const repository = pr.repository;
  const ownRuns = await input2.afterPullRequest?.(pr) ?? [];
  const report = await input2.report(pr);
  const text = new TextDecoder("utf-8").decode(report.bytes);
  const block = recordBlock(extractHandbackBlock(text));
  const found = block.status === "found" ? block.value : null;
  const proposed = input2.advisory === true ? extractClaims(text) : void 0;
  const evidence = await input2.readers.evidence({
    repository,
    pullRequest: pr,
    block: proposed === void 0 ? found : readingBlock(found, proposed, pr.evidence.headSha),
    excludedCheckRunIds: [...input2.excludedCheckRunIds ?? [], ...ownRuns]
  });
  return buildRecord({
    checker: input2.checker,
    report: { sha256: sha256Hex(report.bytes), source: report.source },
    block,
    repository,
    evidence,
    rerun: rerunCommands(input2.recordFile),
    ...input2.assurance === void 0 ? {} : { assurance: input2.assurance },
    ...proposed === void 0 ? {} : { advisory: proposed }
  });
}

// src/record/sign.ts
import { execFileSync } from "node:child_process";
function sshKeygen(args, input2) {
  return execFileSync("ssh-keygen", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...input2 === void 0 ? {} : { input: input2 }
  });
}
function keyFingerprint(keyPath) {
  const out = sshKeygen(["-l", "-E", "sha256", "-f", keyPath]);
  const match = /SHA256:[A-Za-z0-9+/]{43}/.exec(out);
  if (match === null) throw new Error(`ssh-keygen printed no SHA256 fingerprint for ${keyPath}`);
  return match[0];
}
function signRecordFile(recordPath, keyPath) {
  sshKeygen(["-Y", "sign", "-n", SIGNATURE_NAMESPACE, "-f", keyPath, recordPath]);
  return `${recordPath}.sig`;
}

// src/action/artifact.ts
import { crc32 } from "node:zlib";
var DOS_TIME = 0;
var DOS_DATE = 1 << 5 | 1;
var UTF8_NAMES = 2048;
function writeZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.bytes) >>> 0;
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 67324752, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, UTF8_NAMES, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, DOS_TIME, true);
    l.setUint16(12, DOS_DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, file.bytes.length, true);
    l.setUint32(22, file.bytes.length, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 33639248, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, UTF8_NAMES, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, file.bytes.length, true);
    c.setUint32(24, file.bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, file.bytes);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 101010256, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
var ArtifactError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactError";
  }
};
function backendIds(token) {
  let claims;
  try {
    const payload = token.split(".")[1] ?? "";
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new ArtifactError("ACTIONS_RUNTIME_TOKEN is not a readable token");
  }
  const scopes = typeof claims.scp === "string" ? claims.scp.split(" ") : [];
  for (const scope of scopes) {
    const parts = scope.split(":");
    if (parts[0] === "Actions.Results" && parts.length === 3 && parts[1] && parts[2]) {
      return { run: parts[1], job: parts[2] };
    }
  }
  throw new ArtifactError("ACTIONS_RUNTIME_TOKEN carries no Actions.Results scope");
}
var SERVICE = "github.actions.results.api.v1.ArtifactService";
async function twirp(fetchFn, resultsUrl, token, method, body) {
  const url = `${resultsUrl.replace(/\/+$/, "")}/twirp/${SERVICE}/${method}`;
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
    } catch (e) {
      last = `network error (${e.message})`;
      continue;
    }
    const text = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(text);
      } catch {
        throw new ArtifactError(`${method} answered with a body that is not JSON`);
      }
    }
    last = `HTTP ${response.status} ${text.slice(0, 200)}`;
    if (response.status < 500) break;
  }
  throw new ArtifactError(`${method} failed: ${last}`);
}
async function uploadArtifact(env, fetchFn, name, files) {
  const token = env.ACTIONS_RUNTIME_TOKEN;
  const resultsUrl = env.ACTIONS_RESULTS_URL;
  if (token === void 0 || token === "" || resultsUrl === void 0 || resultsUrl === "") {
    throw new ArtifactError(
      "ACTIONS_RUNTIME_TOKEN or ACTIONS_RESULTS_URL is not set: not running as a JavaScript action step"
    );
  }
  const ids = backendIds(token);
  const zip = writeZip(files);
  const sha256 = sha256Hex(zip);
  const created = await twirp(fetchFn, resultsUrl, token, "CreateArtifact", {
    workflow_run_backend_id: ids.run,
    workflow_job_run_backend_id: ids.job,
    name,
    version: 4
  });
  const uploadUrl = created.signed_upload_url ?? created.signedUploadUrl;
  if (created.ok !== true || typeof uploadUrl !== "string") {
    throw new ArtifactError("CreateArtifact did not return an upload URL");
  }
  const put = await fetchFn(uploadUrl, {
    method: "PUT",
    headers: { "x-ms-blob-type": "BlockBlob", "content-type": "zip" },
    body: zip
  });
  if (!put.ok) {
    throw new ArtifactError(`blob upload failed: HTTP ${put.status}`);
  }
  const finalized = await twirp(fetchFn, resultsUrl, token, "FinalizeArtifact", {
    workflow_run_backend_id: ids.run,
    workflow_job_run_backend_id: ids.job,
    name,
    size: String(zip.length),
    hash: `sha256:${sha256}`
  });
  const id = finalized.artifact_id ?? finalized.artifactId;
  if (finalized.ok !== true || typeof id !== "string" && typeof id !== "number") {
    throw new ArtifactError("FinalizeArtifact did not confirm the artifact");
  }
  return { id: String(id), size: zip.length, sha256 };
}

// src/action/check-run.ts
var CHECK_NAME = "dunstan";
function idOf(json) {
  const id = json?.id;
  return typeof id === "number" && Number.isSafeInteger(id) ? id : void 0;
}
async function createCheckRun(client, repository, headSha, body) {
  const read = await client.read("check_runs", `/repos/${repository}/check-runs`, {
    record: false,
    method: "POST",
    requestBody: JSON.stringify({ name: CHECK_NAME, head_sha: headSha, ...body })
  });
  if (!read.ok) return { ok: false, error: read.error };
  const id = idOf(read.json);
  return id === void 0 ? { ok: false, error: "parse" } : { ok: true, id };
}
async function completeCheckRun(client, repository, id, conclusion, output) {
  const read = await client.read("check_runs", `/repos/${repository}/check-runs/${id}`, {
    record: false,
    method: "PATCH",
    requestBody: JSON.stringify({ status: "completed", conclusion, output })
  });
  return read.ok ? { ok: true, id } : { ok: false, error: read.error };
}
async function ownJobCheckRun(client, repository, env) {
  const runId = env.GITHUB_RUN_ID;
  const attempt = env.GITHUB_RUN_ATTEMPT ?? "1";
  const runner = env.RUNNER_NAME;
  if (runId === void 0 || runner === void 0) return void 0;
  const matches = [];
  for (let page = 1; page <= 10; page++) {
    const read = await client.read(
      "workflow_runs",
      `/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`,
      { record: false }
    );
    if (!read.ok) return void 0;
    const jobs = read.json?.jobs;
    if (!Array.isArray(jobs)) return void 0;
    for (const job of jobs) {
      if (job.status !== "in_progress" || job.runner_name !== runner) continue;
      const fromUrl = /\/check-runs\/([0-9]+)$/.exec(String(job.check_run_url ?? ""))?.[1];
      const id = fromUrl === void 0 ? idOf(job) : Number(fromUrl);
      if (id !== void 0) matches.push(id);
    }
    if (jobs.length < 100) break;
  }
  return matches.length === 1 ? matches[0] : void 0;
}

// src/action/inputs.ts
var ActionError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ActionError";
  }
};
var LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;
function input(env, name) {
  return (env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
}
function parseReportSource(value) {
  if (value === "") {
    throw new ActionError(
      "report-source is required (pr-body, comment:<author-login> or file:<path>); the Action never guesses where a report is"
    );
  }
  if (value === "pr-body") return { kind: "pr-body" };
  if (value.startsWith("comment:")) {
    const author = value.slice("comment:".length);
    if (!LOGIN.test(author)) {
      throw new ActionError(`report-source ${value}: "${author}" is not a GitHub login`);
    }
    return { kind: "comment", author };
  }
  if (value.startsWith("file:")) {
    const path = value.slice("file:".length);
    if (path === "") throw new ActionError("report-source file: names no path");
    return { kind: "file", path };
  }
  throw new ActionError(
    `report-source "${value}" is not pr-body, comment:<author-login> or file:<path>`
  );
}
function parseInputs(env) {
  const reportSource = parseReportSource(input(env, "report-source"));
  const unverifiable3 = input(env, "unverifiable-conclusion") || "failure";
  if (unverifiable3 !== "failure" && unverifiable3 !== "neutral") {
    throw new ActionError(
      `unverifiable-conclusion must be failure or neutral, not "${unverifiable3}"`
    );
  }
  const keyPath = input(env, "sign-key-path");
  const signer = input(env, "signer");
  if (keyPath === "" !== (signer === "")) {
    throw new ActionError("sign-key-path and signer go together");
  }
  const advisory = input(env, "advisory") || "false";
  if (advisory !== "true" && advisory !== "false") {
    throw new ActionError(`advisory must be true or false, not "${advisory}"`);
  }
  return {
    reportSource,
    unverifiableConclusion: unverifiable3,
    ...keyPath === "" ? {} : { sign: { keyPath, signer } },
    advisory: advisory === "true"
  };
}

// src/action/event.ts
function member(value, key) {
  return value !== null && typeof value === "object" ? value[key] : void 0;
}
function fullName(side) {
  return member(member(side, "repo"), "full_name");
}
function readEvent(env, readFile) {
  const name = env.GITHUB_EVENT_NAME ?? "";
  const repository = env.GITHUB_REPOSITORY ?? "";
  const path = env.GITHUB_EVENT_PATH ?? "";
  if (repository === "" || path === "") {
    throw new ActionError("GITHUB_REPOSITORY or GITHUB_EVENT_PATH is not set; not a workflow run");
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(readFile(path)));
  } catch (e) {
    throw new ActionError(`cannot read the event payload ${path}: ${e.message}`);
  }
  if (name === "pull_request" || name === "pull_request_target") {
    const pr = member(payload, "pull_request");
    const number = member(pr, "number");
    if (typeof number !== "number") throw new ActionError(`${name} payload has no pull request`);
    const headSha = member(member(pr, "head"), "sha");
    const head = fullName(member(pr, "head"));
    const base = fullName(member(pr, "base"));
    return {
      name,
      repository,
      number,
      ...typeof headSha === "string" ? { headSha } : {},
      // A deleted fork has no head repository; it is still not this repository.
      fork: name === "pull_request" && head !== base
    };
  }
  if (name === "issue_comment") {
    const issue = member(payload, "issue");
    const number = member(issue, "number");
    if (member(issue, "pull_request") === void 0 || typeof number !== "number") {
      throw new ActionError("issue_comment on an issue, not a pull request; nothing to check");
    }
    return { name, repository, number, fork: false };
  }
  throw new ActionError(
    `dunstan checks a pull request: run it on pull_request, pull_request_target or issue_comment, not ${name || "an unnamed event"}`
  );
}

// src/advisory/present.ts
var POSSIBLE_DISAGREEMENT = "possible disagreement, unverified";
var ADVISORY_LINE = "Advisories never affect the verdict. A possible disagreement is unverified: on the reports measured so far it usually reflected a misread of the report, not a false claim.";
var two = (x) => x.toFixed(2);
function advisoryLine(section) {
  const p = section.precision;
  const d = section.differsAccuracy;
  if (p === null || d === null || countOf(d.baseRate) !== 0) return ADVISORY_LINE;
  return [
    "Advisories never affect the verdict.",
    `Extraction precision ${two(p.value)} (${countOf(p)}/${p.n}, 95% CI ${two(p.interval.low)}\u2013${two(p.interval.high)}).`,
    `A possible disagreement is unverified: on ${d.pullRequests} of our own agent PRs, ${countOf(d)} of ${d.n} marked a false claim, and of the ${d.baseRate.n} advisories the record could check there, none was a false claim (${countOf(d.baseRate)} of ${d.baseRate.n}).`
  ].join(" ");
}
var RECORD_SHOWS = {
  declared_not_changed: "not among the changed files",
  not_closing: "not among the closing references",
  not_found: "not found in the record",
  not_reachable: "not reachable from the head",
  head_mismatch: "the head is another commit",
  all_succeeded_mismatch: "the check runs read otherwise",
  count_mismatch: "the record holds another count",
  not_merged: "the pull request is not merged",
  premature: "the recorded merge time is later"
};
function noteText(note) {
  if (!note.startsWith("differs:")) return note;
  const shows = RECORD_SHOWS[note.slice("differs:".length)] ?? "see the record";
  return `${POSSIBLE_DISAGREEMENT}: ${shows}`;
}
function isPossibleDisagreement(note) {
  return note.startsWith("differs:");
}

// src/action/outcome.ts
function conclusionFor(verdict, unverifiable3) {
  if (verdict === "pass") return "success";
  if (verdict === "unverifiable") return unverifiable3;
  return "failure";
}
var SUMMARY_LIMIT = 65535;
var CELL_LIMIT = 160;
var ADVISORY_ROWS = 20;
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r?\n/g, " ");
}
function code(value) {
  if (value === void 0) return "";
  let text = JSON.stringify(value);
  if (text.length > CELL_LIMIT) text = `${text.slice(0, CELL_LIMIT - 1)}\u2026`;
  return `<code>${escapeHtml(text)}</code>`;
}
function titleFor(record) {
  const p = record.predicate;
  if (p.block.status !== "found") return `${p.verdict}: ${p.block.reason}`;
  const total = p.claims.length;
  if (p.verdict === "pass") return `pass: ${total} of ${total} claims hold`;
  const open = p.claims.filter((c) => c.verdict !== "pass");
  const reasons = [...new Set(open.map((c) => c.reason ?? ""))].join(", ");
  return `${p.verdict}: ${open.length} of ${total} claims (${reasons})`.slice(0, 250);
}
function claimRow(c) {
  const verdict = c.verdict === "pass" ? "pass" : `**${c.verdict}**`;
  return `| <code>${escapeHtml(c.id)}</code> | ${code(c.declared)} | ${code(c.observed)} | ${verdict} | ${c.reason === void 0 ? "" : `<code>${escapeHtml(c.reason)}</code>`} |`;
}
function blockLine(record) {
  const b = record.predicate.block;
  if (b.status === "found") return `found (sha256 <code>${b.sha256}</code>)`;
  if (b.status === "ambiguous") return `ambiguous: <code>${b.reason}</code>, ${b.count} blocks`;
  if (b.status === "invalid") {
    const codes = [...new Set(b.errors.map((e) => e.code))].join(", ");
    return `invalid: <code>${b.reason}</code> (${escapeHtml(codes)})`;
  }
  return `missing: <code>${b.reason}</code>`;
}
function advisorySection2(section) {
  const shown = section.advisories.filter((a) => isPossibleDisagreement(a.note));
  const lines = ["### Advisories (DRAFT, not part of the verdict)", "", advisoryLine(section), ""];
  if (shown.length === 0) return lines;
  lines.push(
    "| Note | Kind | Value | Observed | Clause |",
    "| --- | --- | --- | --- | --- |",
    ...shown.slice(0, ADVISORY_ROWS).map(
      (a) => `| ${escapeHtml(noteText(a.note))} | <code>${a.kind}</code> | ${code(a.value)} | ${code(a.observed)} | ${code(a.clause)} |`
    )
  );
  if (shown.length > ADVISORY_ROWS) {
    lines.push("", `${shown.length - ADVISORY_ROWS} more are in the record.`);
  }
  return [...lines, ""];
}
function renderSummary(outcome) {
  const head = [`## dunstan: ${outcome.conclusion}`, ""];
  head.push(`**${escapeHtml(outcome.title)}**`, "");
  if (outcome.mapping !== void 0) head.push(outcome.mapping, "");
  const tail = [];
  const record = outcome.record;
  if (record === void 0) {
    head.push(
      `No record was written: ${escapeHtml(outcome.error ?? "unknown error")}`,
      "",
      "A missing or unreadable report source, an event Dunstan cannot check, or a crash is reported as `failure`, never as a pass.",
      ""
    );
  } else {
    const p = record.predicate;
    head.push(
      "| | |",
      "| --- | --- |",
      `| Subject | ${escapeHtml(p.subject.repository)}#${p.subject.pullRequest} at <code>${p.subject.headSha}</code> |`,
      `| Report | ${p.report.source.kind} <code>${escapeHtml(p.report.source.locator)}</code> (sha256 <code>${p.report.sha256}</code>) |`,
      `| Block | ${blockLine(record)} |`,
      `| Verdict | <code>${p.verdict}</code> |`,
      `| Digests | claims <code>${p.digests.claims}</code>, evidence <code>${p.digests.evidence}</code> |`,
      `| Checker | ${p.checker.name} ${p.checker.version} (sha256 <code>${p.checker.digest.sha256}</code>) |`
    );
    if (p.advisory !== void 0) {
      const notes = p.advisory.advisories.map((a) => a.note.split(":")[0]);
      const count = (n) => notes.filter((x) => x === n).length;
      head.push(
        `| Advisory (DRAFT, not part of the verdict) | ${notes.length} advisories: ${count("agrees")} agree; ${count("agrees_by_name")} agree by name only; ${count("differs")} ${POSSIBLE_DISAGREEMENT}; ${count("unanswered")} unanswered. Extractor ${escapeHtml(p.advisory.extractor.version)}, comparison ${escapeHtml(p.advisory.comparison.version)}, precision ${escapeHtml(precisionText(p.advisory.precision))}. Each is in the record. |`
      );
      tail.push(...advisorySection2(p.advisory));
    }
    head.push("");
    const unread2 = p.evidence.sources.filter((s) => s.error !== void 0);
    if (unread2.length > 0) {
      tail.push(
        "### Unreadable sources",
        "",
        ...unread2.map(
          (s) => `- ${s.kind} <code>${escapeHtml(s.locator)}</code>: <code>${escapeHtml(s.error ?? "")}</code>`
        ),
        ""
      );
    }
  }
  if (outcome.rerun !== void 0) {
    tail.push("### Re-run", "", "```sh", ...outcome.rerun, "```", "");
  }
  if (outcome.notes.length > 0) {
    tail.push("### Notes", "", ...outcome.notes.map((n) => `- ${n}`), "");
  }
  const claims = record?.predicate.claims ?? [];
  const tableHead = claims.length === 0 ? [] : [
    "### Claims",
    "",
    "| Claim | Declared | Observed | Verdict | Reason |",
    "| --- | --- | --- | --- | --- |"
  ];
  const fixed = [...head, ...tableHead, "", ...tail].join("\n").length + 200;
  const rows = [];
  let size = fixed;
  for (const [i, c] of claims.entries()) {
    const row = claimRow(c);
    if (size + row.length + 1 > SUMMARY_LIMIT) {
      rows.push("", `${claims.length - i} more rows are in the record (summary size limit).`);
      break;
    }
    rows.push(row);
    size += row.length + 1;
  }
  const table = claims.length === 0 ? [] : [...tableHead, ...rows, ""];
  return [...head, ...table, ...tail].join("\n");
}

// src/action/run.ts
var RECORD_FILE = "dunstan-record.json";
var ARTIFACT_NAME = "dunstan-record";
var FORK_NOTE = "This pull request comes from a fork. GitHub gives its `pull_request` workflow a read-only token, which cannot create check runs, so the result is in this job summary and the step's exit status only. A required `dunstan` check stays pending for it.";
async function readReport(source, pr, client) {
  switch (source.kind) {
    case "pr-body":
      return reportFromPullRequestBody(pr.repository, pr);
    case "comment":
      return reportFromComment(client, pr.repository, pr.evidence.number, source.author);
    case "file": {
      let bytes;
      try {
        bytes = readFileSync2(source.path);
      } catch (e) {
        throw new ActionError(
          `report file ${source.path} is unreadable (${e.code ?? e.message})`
        );
      }
      return { bytes, source: { kind: "file", locator: source.path } };
    }
  }
}
function mappingFor(record, inputs) {
  const verdict = record.predicate.verdict;
  if (verdict === "pass") return "Verdict `pass` concludes `success`.";
  if (verdict === "fail") return "Verdict `fail` concludes `failure`.";
  return inputs.unverifiableConclusion === "neutral" ? "Verdict `unverifiable` concludes `neutral` because this workflow sets `unverifiable-conclusion: neutral`. GitHub lets a merge through on a neutral required check." : "Verdict `unverifiable` concludes `failure`: a claim the record cannot answer is not a pass.";
}
function rerunLines(env, record) {
  const p = record.predicate;
  const download = env.GITHUB_RUN_ID === void 0 ? `# download the ${ARTIFACT_NAME} artifact of this run` : `gh run download ${env.GITHUB_RUN_ID} --repo ${p.subject.repository} --name ${ARTIFACT_NAME}`;
  return [
    download,
    `${p.rerun.offline}   # offline: recompute claims, verdict and digests`,
    `${p.rerun.online}    # online: re-read the sources, report evidence_changed`
  ];
}
function describeError(e) {
  if (e instanceof ActionError || e instanceof PullRequestUnreadable || e instanceof ReportUnavailable) {
    return { message: e.message, internal: false };
  }
  return { message: `internal error: ${e.message ?? String(e)}`, internal: true };
}
function escapeCommand(text) {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
async function runAction(io) {
  const env = io.env;
  const notes = [];
  let client;
  let repository;
  let headSha;
  let checkRunId;
  let canWriteCheckRun = true;
  let recordPath;
  let outcome;
  try {
    const event = readEvent(env, (path) => readFileSync2(path));
    repository = event.repository;
    headSha = event.headSha;
    if (event.fork) {
      canWriteCheckRun = false;
      notes.push(FORK_NOTE);
    }
    const token = input(env, "github-token");
    const api = new GitHubClient({
      token: token === "" ? void 0 : token,
      baseUrl: env.GITHUB_API_URL || DEFAULT_API,
      ...io.fetch === void 0 ? {} : { fetch: io.fetch },
      warn: (message) => io.log(`::warning title=dunstan::${escapeCommand(message)}`)
    });
    client = api;
    const inputs = parseInputs(env);
    if (event.name === "pull_request_target" && inputs.reportSource.kind === "file") {
      throw new ActionError(
        "refused: under pull_request_target the report must come from the API (pr-body or comment:<login>), never from a file in the workspace, which may hold code from the pull request"
      );
    }
    let assurance;
    if (inputs.sign !== void 0) {
      assurance = {
        status: "signed",
        issuer: inputs.sign.signer,
        keyFingerprint: keyFingerprint(inputs.sign.keyPath)
      };
    }
    const record = await checkPullRequest({
      readers: io.readers?.(api) ?? githubReaders(api),
      repository: event.repository,
      number: event.number,
      afterPullRequest: async (pr) => {
        repository = pr.repository;
        headSha = pr.evidence.headSha;
        const own = [];
        if (canWriteCheckRun) {
          const created = await createCheckRun(api, pr.repository, pr.evidence.headSha, {
            status: "in_progress",
            ...env.GITHUB_SERVER_URL && env.GITHUB_RUN_ID ? {
              details_url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
            } : {}
          });
          if (created.ok) {
            checkRunId = created.id;
            own.push(created.id);
          } else {
            canWriteCheckRun = false;
            notes.push(
              `The \`${CHECK_NAME}\` check run could not be created (${created.error}): the token cannot write checks here (\`checks: write\` missing, or a read-only token). The result is in this job summary and the step's exit status only.`
            );
          }
        }
        const job = await ownJobCheckRun(api, pr.repository, env);
        if (job === void 0) {
          notes.push(
            "This job's own check run could not be identified, so it was not excluded: a `checks` claim counts it, in progress."
          );
        } else {
          own.push(job);
        }
        return own;
      },
      report: (pr) => readReport(inputs.reportSource, pr, api),
      checker: checkerIdentity(io.artifact),
      recordFile: RECORD_FILE,
      ...assurance === void 0 ? {} : { assurance },
      advisory: inputs.advisory
    });
    const dir = join(env.RUNNER_TEMP || tmpdir(), "dunstan");
    mkdirSync(dir, { recursive: true });
    const out = join(dir, RECORD_FILE);
    writeFileSync(out, serializeRecord(record));
    recordPath = out;
    const verdict = record.predicate.verdict;
    outcome = {
      conclusion: conclusionFor(verdict, inputs.unverifiableConclusion),
      verdict,
      title: titleFor(record),
      record,
      mapping: mappingFor(record, inputs),
      rerun: rerunLines(env, record),
      notes
    };
    try {
      const files = [{ name: RECORD_FILE, bytes: readFileSync2(out) }];
      if (inputs.sign !== void 0) {
        const sig = signRecordFile(out, inputs.sign.keyPath);
        files.push({ name: `${RECORD_FILE}.sig`, bytes: readFileSync2(sig) });
      }
      const upload = io.upload ?? ((name, f) => uploadArtifact(env, io.fetch ?? fetch, name, f));
      const uploaded = await upload(ARTIFACT_NAME, files);
      io.log(
        `dunstan: uploaded artifact ${ARTIFACT_NAME} (id ${uploaded.id}, ${uploaded.size} bytes)`
      );
    } catch (e) {
      outcome = {
        ...outcome,
        conclusion: "failure",
        title: `error: record not uploaded (verdict ${verdict})`,
        error: e.message
      };
      notes.push(
        `The record was not uploaded as \`${ARTIFACT_NAME}\` (${e.message}), so this run concludes \`failure\` whatever the verdict.`
      );
    }
  } catch (e) {
    const { message, internal } = describeError(e);
    if (internal) io.log(`dunstan: ${e.stack ?? String(e)}`);
    outcome = {
      conclusion: "failure",
      verdict: "error",
      title: `error: ${message}`.slice(0, 250),
      error: message,
      notes
    };
  }
  const output = { title: outcome.title, summary: renderSummary(outcome) };
  if (canWriteCheckRun) {
    let written;
    if (client !== void 0 && repository !== void 0) {
      written = checkRunId !== void 0 ? await completeCheckRun(client, repository, checkRunId, outcome.conclusion, output) : headSha !== void 0 ? await createCheckRun(client, repository, headSha, {
        status: "completed",
        conclusion: outcome.conclusion,
        output
      }) : void 0;
    }
    if (written === void 0) {
      notes.push(
        `No \`${CHECK_NAME}\` check run was written: the pull request's head commit is not known. A required \`${CHECK_NAME}\` check stays pending.`
      );
    } else if (!written.ok) {
      notes.push(
        `The \`${CHECK_NAME}\` check run could not be written (${written.error}). A required \`${CHECK_NAME}\` check stays pending or in progress.`
      );
    } else {
      io.log(`dunstan: check run ${CHECK_NAME} ${written.id}: ${outcome.conclusion}`);
    }
  }
  const summary = renderSummary(outcome);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}
`);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(
      env.GITHUB_OUTPUT,
      `verdict=${outcome.verdict}
record-path=${recordPath ?? ""}
`
    );
  }
  const line = `dunstan: ${outcome.conclusion}: ${outcome.title}`;
  io.log(outcome.conclusion === "failure" ? `::error title=dunstan::${escapeCommand(line)}` : line);
  return {
    outcome,
    exitCode: outcome.conclusion === "failure" ? 1 : 0,
    ...recordPath === void 0 ? {} : { recordPath }
  };
}

// src/action/bin.ts
process.exitCode = 1;
var result = await runAction({
  env: process.env,
  artifact: import.meta.url,
  log: (line) => process.stdout.write(`${line}
`)
});
process.exitCode = result.exitCode;
