/* global env: true */

const doop = require('jsdoc/util/doop');
const fs = require('jsdoc/fs');
const helper = require('jsdoc/util/templateHelper');
const logger = require('jsdoc/util/logger');
const path = require('jsdoc/path');
const taffy = require('taffydb').taffy;
const template = require('jsdoc/template');
const util = require('util');
const fse = require('fs-extra');
const nanoid = require('nanoid').nanoid;
const htmlMinify = require('html-minifier');

const htmlsafe = helper.htmlsafe;
const linkto = helper.linkto;
const resolveAuthorLinks = helper.resolveAuthorLinks;
const hasOwnProp = Object.prototype.hasOwnProperty;

/* prettier-ignore-start */
// eslint-disable-next-line
const themeOpts = (env && env.opts && env.opts['theme_opts']) || {};
/* prettier-ignore-end */

let data;
let view;
const searchListArray = [];
const hasSearch =
    themeOpts.search === undefined ? true : Boolean(themeOpts.search);

// eslint-disable-next-line no-restricted-globals
let outdir = path.normalize(env.opts.destination);

const SECTION_TYPE = {
  Classes: 'Classes',
  Modules: 'Modules',
  Externals: 'Externals',
  Events: 'Events',
  Namespaces: 'Namespaces',
  Mixins: 'Mixins',
  Tutorials: 'Tutorials',
  Interfaces: 'Interfaces',
  Global: 'Global'
};

const defaultSections = [
  SECTION_TYPE.Modules,
  SECTION_TYPE.Classes,
  SECTION_TYPE.Externals,
  SECTION_TYPE.Events,
  SECTION_TYPE.Namespaces,
  SECTION_TYPE.Mixins,
  SECTION_TYPE.Tutorials,
  SECTION_TYPE.Interfaces,
  SECTION_TYPE.Global
];

const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  removeComments: true,
  html5: true,
  minifyJS: true,
  minifyCSS: true
};

function copyStaticFolder() {
  const staticDir = themeOpts.static_dir || undefined;

  if (staticDir) {
    for (let i = 0; i < staticDir.length; i++) {
      let output = path.join(outdir, staticDir[i]);

      fse.copySync(staticDir[i], output);
    }
  }
}

copyStaticFolder();

function copyToOutputFolder(filePath) {
  const filePathNormalized = path.normalize(filePath);

  fs.copyFileSync(filePathNormalized, outdir);
}

function copyToOutputFolderFromArray(filePathArray) {
  const outputList = [];

  if (Array.isArray(filePathArray)) {
    for (let i = 0; i < filePathArray.length; i++) {
      copyToOutputFolder(filePathArray[i]);
      outputList.push(path.basename(filePathArray[i]));
    }
  }

  return outputList;
}

function find(spec) {
  return helper.find(data, spec);
}

function tutoriallink(tutorial) {
  return helper.toTutorial(tutorial, null, {
    tag: 'em',
    classname: 'disabled',
    prefix: 'Tutorial: '
  });
}

function getAncestorLinks(doclet) {
  return helper.getAncestorLinks(data, doclet);
}

function hashToLink(doclet, hash) {
  if (!/^(#.+)/.test(hash)) {
    return hash;
  }

  let url = helper.createLink(doclet);

  url = url.replace(/(#.+|$)/, hash);

  return '<a href="' + url + '">' + hash + '</a>';
}

function needsSignature(doclet) {
  let needsSig = false;

  // function and class definitions always get a signature
  if (doclet.kind === 'function' || doclet.kind === 'class') {
    needsSig = true;
  }
  // typedefs that contain functions get a signature, too
  else if (
    doclet.kind === 'typedef' &&
        doclet.type &&
        doclet.type.names &&
        doclet.type.names.length
  ) {
    for (let i = 0, l = doclet.type.names.length; i < l; i++) {
      if (doclet.type.names[i].toLowerCase() === 'function') {
        needsSig = true;
        break;
      }
    }
  }

  return needsSig;
}

function getSignatureAttributes(item) {
  const attributes = [];

  if (item.optional) {
    attributes.push('opt');
  }

  if (item.nullable === true) {
    attributes.push('nullable');
  } else if (item.nullable === false) {
    attributes.push('non-null');
  }

  return attributes;
}

function updateItemName(item) {
  const attributes = getSignatureAttributes(item);
  let itemName = item.name || '';

  if (item.variable) {
    itemName = '&hellip;' + itemName;
  }

  if (attributes && attributes.length) {
    itemName = util.format(
      '%s<span class="signature-attributes">%s</span>',
      itemName,
      attributes.join(', ')
    );
  }

  return itemName;
}

function addParamAttributes(params) {
  return params
    .filter(function(param) {
      return param.name && param.name.indexOf('.') === -1;
    })
    .map(updateItemName);
}

function buildItemTypeStrings(item) {
  const types = [];

  if (item && item.type && item.type.names) {
    item.type.names.forEach(function(name) {
      types.push(linkto(name, htmlsafe(name)));
    });
  }

  return types;
}

function buildAttribsString(attribs) {
  let attribsString = '';

  if (attribs && attribs.length) {
    attribsString = htmlsafe(util.format('(%s) ', attribs.join(', ')));
  }

  return attribsString;
}

function addNonParamAttributes(items) {
  let types = [];

  items.forEach(function(item) {
    types = types.concat(buildItemTypeStrings(item));
  });

  return types;
}

function addSignatureParams(f) {
  const params = f.params ? addParamAttributes(f.params) : [];

  f.signature = util.format('%s(%s)', f.signature || '', params.join(', '));
}

function addSignatureReturns(f) {
  const attribs = [];
  let attribsString = '';
  let returnTypes = [];
  let returnTypesString = '';

  // jam all the return-type attributes into an array. this could create odd results (for example,
  // if there are both nullable and non-nullable return types), but let's assume that most people
  // who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
  if (f.returns) {
    f.returns.forEach(function(item) {
      helper.getAttribs(item).forEach(function(attrib) {
        if (attribs.indexOf(attrib) === -1) {
          attribs.push(attrib);
        }
      });
    });

    attribsString = buildAttribsString(attribs);
  }

  if (f.returns) {
    returnTypes = addNonParamAttributes(f.returns);
  }
  if (returnTypes.length) {
    returnTypesString = util.format(
      ' &rarr; %s{%s}',
      attribsString,
      returnTypes.join('|')
    );
  }

  f.signature =
        '<span class="signature">' +
        (f.signature || '') +
        '</span>' +
        '<span class="type-signature">' +
        returnTypesString +
        '</span>';
}

function addSignatureTypes(f) {
  const types = f.type ? buildItemTypeStrings(f) : [];

  f.signature =
        (f.signature || '') +
        '<span class="type-signature">' +
        (types.length ? ' :' + types.join('|') : '') +
        '</span>';
}

function addAttribs(f) {
  const attribs = helper.getAttribs(f);
  const attribsString = buildAttribsString(attribs);

  f.attribs = util.format(
    '<span class="type-signature">%s</span>',
    attribsString
  );
}

function shortenPaths(files, commonPrefix) {
  Object.keys(files).forEach(function(file) {
    files[file].shortened = files[file].resolved
      .replace(commonPrefix, '')
    // always use forward slashes
      .replace(/\\/g, '/');
  });

  return files;
}

function getPathFromDoclet(doclet) {
  if (!doclet.meta) {
    return null;
  }

  return doclet.meta.path && doclet.meta.path !== 'null' ?
    path.join(doclet.meta.path, doclet.meta.filename) :
    doclet.meta.filename;
}

function generate(type, title, docs, filename, resolveLinks) {
  resolveLinks = resolveLinks !== false;

  const docData = {
    type: type,
    title: title,
    docs: docs
  };

  const outpath = path.join(outdir, filename);
  let html = view.render('container.tmpl', docData);

  if (resolveLinks) {
    html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
  }

  fs.writeFileSync(
    outpath,
    htmlMinify.minify(html, HTML_MINIFY_OPTIONS),
    'utf8'
  );
}

function generateSourceFiles(sourceFiles, encoding) {
  encoding = encoding || 'utf8';
  Object.keys(sourceFiles).forEach(function(file) {
    let source;
    // links are keyed to the shortened path in each doclet's `meta.shortpath` property
    const sourceOutfile = helper.getUniqueFilename(
      sourceFiles[file].shortened
    );

    helper.registerLink(sourceFiles[file].shortened, sourceOutfile);

    try {
      source = {
        kind: 'source',
        title: sourceOutfile.replace('.html', ''),
        code: helper.htmlsafe(
          fs.readFileSync(sourceFiles[file].resolved, encoding)
        )
      };
    } catch (e) {
      logger.error(
        'Error while generating source file %s: %s',
        file,
        e.message
      );
    }

    generate(
      'Source',
      sourceFiles[file].shortened,
      [source],
      sourceOutfile,
      false
    );
  });
}

/**
 * Look for classes or functions with the same name as modules (which indicates that the module
 * exports only that class or function), then attach the classes or functions to the `module`
 * property of the appropriate module doclets. The name of each class or function is also updated
 * for display purposes. This function mutates the original arrays.
 *
 * @private
 * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to
 * check.
 * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
 */
function attachModuleSymbols(doclets, modules) {
  const symbols = {};

  // build a lookup table
  doclets.forEach(function(symbol) {
    symbols[symbol.longname] = symbols[symbol.longname] || [];
    symbols[symbol.longname].push(symbol);
  });

  // eslint-disable-next-line array-callback-return
  return modules.map(function(module) {
    if (symbols[module.longname]) {
      module.modules = symbols[module.longname]
      // Only show symbols that have a description. Make an exception for classes, because
      // we want to show the constructor-signature heading no matter what.
        .filter(function(symbol) {
          return symbol.description || symbol.kind === 'class';
        })
        .map(function(symbol) {
          symbol = doop(symbol);

          if (symbol.kind === 'class' || symbol.kind === 'function') {
            symbol.name =
                            symbol.name.replace('module:', '(require("') +
                            '"))';
          }

          return symbol;
        });
    }
  });
}

function buildFooter() {
  return themeOpts.footer;
}

function getFavicon() {
  return themeOpts.favicon || undefined;
}

// function copy
function createDynamicStyleSheet() {
  return themeOpts.create_style || undefined;
}

function createDynamicsScripts() {
  return themeOpts.add_scripts || undefined;
}

function returnPathOfScriptScr() {
  return themeOpts.add_script_path || undefined;
}

function returnPathOfStyleSrc() {
  return themeOpts.add_style_path || undefined;
}

function includeCss() {
  let stylePath = themeOpts.include_css || undefined;

  if (stylePath) {
    stylePath = copyToOutputFolderFromArray(stylePath);
  }

  return stylePath;
}

function resizeable() {
  return themeOpts.resizeable || {};
}

function codepen() {
  return themeOpts.codepen || {};
}

function includeScript() {
  let scriptPath = themeOpts.include_js || undefined;

  if (scriptPath) {
    scriptPath = copyToOutputFolderFromArray(scriptPath);
  }

  return scriptPath;
}

function getMetaTagData() {
  return themeOpts.meta || undefined;
}

function getTheme() {
  return themeOpts.default_theme || 'dark';
}

function getBaseURL() {
  return themeOpts.base_url;
}

function buildSidebarMembers({
  items,
  itemHeading,
  itemsSeen,
  linktoFn,
  sectionName
}) {
  const navProps = {
    name: itemHeading,
    items: [],
    id: nanoid()
  };

  if (items.length) {
    items.forEach(function(item) {
      const currentItem = {
        name: item.name,
        anchor: item.longname ?
          linktoFn(item.longname, item.name) :
          linktoFn('', item.name),
        children: []
      };

      const methods =
                sectionName === SECTION_TYPE.Tutorials ||
                sectionName === SECTION_TYPE.Global ?
                  [] :
                  find({
                    kind: 'function',
                    memberof: item.longname,
                    inherited: {
                      '!is': Boolean(themeOpts.exclude_inherited)
                    }
                  });

      if (!hasOwnProp.call(itemsSeen, item.longname)) {
        currentItem.anchor = linktoFn(
          item.longname,
          item.name.replace(/^module:/, '')
        );

        if (hasSearch) {
          searchListArray.push({
            title: item.name,
            link: linktoFn(item.longname, item.name),
            description: item.description
          });
        }

        if (methods.length) {
          methods.forEach(function(method) {
            const itemChild = {
              name: method.longName,
              link: linktoFn(method.longname, method.name)
            };

            currentItem.children.push(itemChild);

            let name = method.longname.split(
              method.scope === 'static' ? '.' : '#'
            );
            const first = name[0];
            const last = name[1];

            name = first + ' &rtrif; ' + last;

            if (hasSearch) {
              searchListArray.push({
                title: method.longname,
                link: linktoFn(method.longname, name),
                description: item.classdesc
              });
            }
          });
        }
        itemsSeen[item.longname] = true;
      }

      navProps.items.push(currentItem);
    });
  }

  return navProps;
}

function linktoTutorial(longName, name) {
  return tutoriallink(name);
}

function linktoExternal(longName, name) {
  return linkto(longName, name.replace(/(^"|"$)/g, ''));
}

function buildNavbar() {
  return {
    menu: themeOpts.menu || undefined,
    search: hasSearch
  };
}

/**
 * Create the navigation sidebar.
 * @param {object} members The members that will be used to create the sidebar.
 * @param {array<object>} members.classes
 * @param {array<object>} members.externals
 * @param {array<object>} members.globals
 * @param {array<object>} members.mixins
 * @param {array<object>} members.modules
 * @param {array<object>} members.namespaces
 * @param {array<object>} members.tutorials
 * @param {array<object>} members.events
 * @param {array<object>} members.interfaces
 * @return {string} The HTML for the navigation sidebar.
 */
function buildSidebar(members) {
  const title = themeOpts.title || 'Home';

  const isHTML = RegExp.prototype.test.bind(/(<([^>]+)>)/i);

  const nav = {
    sections: []
  };

  if (!isHTML(title)) {
    nav.title = {
      title,
      isHTML: false
    };
  } else {
    nav.title = {
      title,
      isHTML: true
    };
  }

  const seen = {};
  const seenTutorials = {};
  const seenGlobal = {};

  const sectionsOrder = themeOpts.sections || defaultSections;

  const sections = {
    [SECTION_TYPE.Modules]: buildSidebarMembers({
      itemHeading: 'Modules',
      items: members.modules,
      itemsSeen: seen,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Modules
    }),

    [SECTION_TYPE.Classes]: buildSidebarMembers({
      itemHeading: 'Classes',
      items: members.classes,
      itemsSeen: seen,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Classes
    }),

    [SECTION_TYPE.Externals]: buildSidebarMembers({
      itemHeading: 'Externals',
      items: members.externals,
      itemsSeen: seen,
      linktoFn: linktoExternal,
      sectionName: SECTION_TYPE.Externals
    }),

    [SECTION_TYPE.Events]: buildSidebarMembers({
      itemHeading: 'Events',
      items: members.events,
      itemsSeen: seen,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Events
    }),

    [SECTION_TYPE.Namespaces]: buildSidebarMembers({
      itemHeading: 'Namespaces',
      items: members.namespaces,
      itemsSeen: seen,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Namespaces
    }),

    [SECTION_TYPE.Mixins]: buildSidebarMembers({
      itemHeading: 'Mixins',
      items: members.mixins,
      itemsSeen: seen,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Mixins
    }),

    [SECTION_TYPE.Tutorials]: buildSidebarMembers({
      itemHeading: 'Tutorials',
      items: members.tutorials,
      itemsSeen: seenTutorials,
      linktoFn: linktoTutorial,
      sectionName: SECTION_TYPE.Tutorials
    }),

    [SECTION_TYPE.Interfaces]: buildSidebarMembers({
      itemHeading: 'Interfaces',
      items: members.interfaces,
      itemsSeen: seen,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Interfaces
    }),

    [SECTION_TYPE.Global]: buildSidebarMembers({
      itemHeading: 'Global',
      items: members.globals,
      itemsSeen: seenGlobal,
      linktoFn: linkto,
      sectionName: SECTION_TYPE.Global
    })
  };

  sectionsOrder.forEach((section) => {
    if (SECTION_TYPE[section] !== undefined) {
      nav.sections.push(sections[section]);
    } else {
      const errorMsg = `While building nav. Section name: ${section} is not recognized.
            Accepted sections are: ${defaultSections.join(', ')} 
            `;

      throw new Error(errorMsg);
    }
  });

  return nav;
}

/**
    @param {TAFFY} taffyData See <http://taffydb.com/>.
    @param {object} opts
    @param {Tutorial} tutorials
 */
exports.publish = function(taffyData, opts, tutorials) {
  data = taffyData;

  // eslint-disable-next-line no-restricted-globals
  const conf = env.conf.templates || {};

  conf.default = conf.default || {};

  const templatePath = path.normalize(opts.template);

  view = new template.Template(path.join(templatePath, 'tmpl'));

  // claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
  // doesn't try to hand them out later
  const indexUrl = helper.getUniqueFilename('index');
  // don't call registerLink() on this one! 'index' is also a valid longname

  const globalUrl = helper.getUniqueFilename('global');

  helper.registerLink('global', globalUrl);

  // set up templating
  view.layout = conf.default.layoutFile ?
    path.getResourcePath(
      path.dirname(conf.default.layoutFile),
      path.basename(conf.default.layoutFile)
    ) :
    'layout.tmpl';

  // set up tutorials for helper
  helper.setTutorials(tutorials);

  data = helper.prune(data);
  data.sort('longname, version, since');
  helper.addEventListeners(data);

  let sourceFiles = {};
  const sourceFilePaths = [];

  data().each(function(doclet) {
    doclet.attribs = '';

    if (doclet.examples) {
      doclet.examples = doclet.examples.map(function(example) {
        let caption, code;

        if (example === undefined) {
          return {
            caption: '',
            code: ''
          };
        }

        if (
          example.match(
            /^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i
          )
        ) {
          caption = RegExp.$1;
          code = RegExp.$3;
        }

        return {
          caption: caption || '',
          code: code || example
        };
      });
    }
    if (doclet.see) {
      doclet.see.forEach(function(seeItem, i) {
        doclet.see[i] = hashToLink(doclet, seeItem);
      });
    }

    // build a list of source files
    let sourcePath;

    if (doclet.meta) {
      sourcePath = getPathFromDoclet(doclet);
      sourceFiles[sourcePath] = {
        resolved: sourcePath,
        shortened: null
      };
      if (sourceFilePaths.indexOf(sourcePath) === -1) {
        sourceFilePaths.push(sourcePath);
      }
    }
  });

  // update outdir if necessary, then create outdir
  const packageInfo = (find({ kind: 'package' }) || [])[0];

  if (packageInfo && packageInfo.name) {
    outdir = path.join(outdir, packageInfo.name, packageInfo.version || '');
  }
  fs.mkPath(outdir);

  // copy the template's static files to outdir
  const fromDir = path.join(templatePath, 'static');
  const staticFiles = fs.ls(fromDir, 3);

  staticFiles.forEach(function(fileName) {
    const toDir = fs.toDir(fileName.replace(fromDir, outdir));

    fs.mkPath(toDir);
    fs.copyFileSync(fileName, toDir);
  });

  // copy user-specified static files to outdir
  let staticFilePaths, staticFileFilter, staticFileScanner;

  if (conf.default.staticFiles) {
    // The canonical property name is `include`. We accept `paths` for backwards compatibility
    // with a bug in JSDoc 3.2.x.
    staticFilePaths =
            conf.default.staticFiles.include ||
            conf.default.staticFiles.paths ||
            [];
    staticFileFilter = new (require('jsdoc/src/filter').Filter)(
      conf.default.staticFiles
    );
    staticFileScanner = new (require('jsdoc/src/scanner').Scanner)();

    staticFilePaths.forEach(function(filePath) {
      const extraStaticFiles = staticFileScanner.scan(
        [filePath],
        10,
        staticFileFilter
      );

      extraStaticFiles.forEach(function(fileName) {
        const sourcePath = fs.toDir(filePath);
        const toDir = fs.toDir(fileName.replace(sourcePath, outdir));

        fs.mkPath(toDir);
        fs.copyFileSync(fileName, toDir);
      });
    });
  }

  if (sourceFilePaths.length) {
    sourceFiles = shortenPaths(
      sourceFiles,
      path.commonPrefix(sourceFilePaths)
    );
  }
  data().each(function(doclet) {
    const url = helper.createLink(doclet);

    helper.registerLink(doclet.longname, url);

    // add a shortened version of the full path
    let docletPath;

    if (doclet.meta) {
      docletPath = getPathFromDoclet(doclet);
      docletPath = sourceFiles[docletPath].shortened;
      if (docletPath) {
        doclet.meta.shortpath = docletPath;
      }
    }
  });

  data().each(function(doclet) {
    const url = helper.longnameToUrl[doclet.longname];

    if (url.indexOf('#') > -1) {
      doclet.id = helper.longnameToUrl[doclet.longname].split(/#/).pop();
    } else {
      doclet.id = doclet.name;
    }

    if (needsSignature(doclet)) {
      addSignatureParams(doclet);
      addSignatureReturns(doclet);
      addAttribs(doclet);
    }
  });

  // do this after the urls have all been generated
  data().each(function(doclet) {
    doclet.ancestors = getAncestorLinks(doclet);

    if (doclet.kind === 'member') {
      addSignatureTypes(doclet);
      addAttribs(doclet);
    }

    if (doclet.kind === 'constant') {
      addSignatureTypes(doclet);
      addAttribs(doclet);
      doclet.kind = 'member';
    }
  });

  const members = helper.getMembers(data);

  members.tutorials = tutorials.children;

  // output pretty-printed source files by default
  const outputSourceFiles = Boolean(
    conf.default && conf.default.outputSourceFiles !== false
  );

  // add template helpers
  view.find = find;
  view.linkto = linkto;
  view.resolveAuthorLinks = resolveAuthorLinks;
  view.tutoriallink = tutoriallink;
  view.htmlsafe = htmlsafe;
  view.outputSourceFiles = outputSourceFiles;
  view.footer = buildFooter();
  view.favicon = getFavicon();
  view.dynamicStyle = createDynamicStyleSheet();
  view.dynamicStyleSrc = returnPathOfStyleSrc();
  view.dynamicScript = createDynamicsScripts();
  view.dynamicScriptSrc = returnPathOfScriptScr();
  view.includeScript = includeScript();
  view.includeCss = includeCss();
  view.meta = getMetaTagData();
  view.theme = getTheme();
  // once for all
  view.sidebar = buildSidebar(members);
  view.navbar = buildNavbar();
  view.resizeable = resizeable();
  view.codepen = codepen();
  view.baseURL = getBaseURL();
  view.excludeInherited = Boolean(themeOpts.exclude_inherited);
  attachModuleSymbols(
    find({ longname: { left: 'module:' } }),
    members.modules
  );

  // output search file if search

  if (hasSearch) {
    fs.mkPath(path.join(outdir, 'data'));
    fs.writeFileSync(
      path.join(outdir, 'data', 'search.json'),
      JSON.stringify({
        list: searchListArray
      })
    );
  }

  // generate the pretty-printed source files first so other pages can link to them
  if (outputSourceFiles) {
    generateSourceFiles(sourceFiles, opts.encoding);
  }

  if (members.globals.length) {
    generate('', 'Global', [{ kind: 'globalobj' }], globalUrl);
  }

  // index page displays information from package.json and lists files
  const files = find({ kind: 'file' });
  const packages = find({ kind: 'package' });

  generate(
    '',
    'Home',
    packages
      .concat([
        {
          kind: 'mainpage',
          readme: opts.readme,
          longname: opts.mainpagetitle ?
            opts.mainpagetitle :
            'Main Page'
        }
      ])
      .concat(files),
    indexUrl
  );

  // set up the lists that we'll use to generate pages
  const classes = taffy(members.classes);
  const modules = taffy(members.modules);
  const namespaces = taffy(members.namespaces);
  const mixins = taffy(members.mixins);
  const externals = taffy(members.externals);
  const interfaces = taffy(members.interfaces);

  Object.keys(helper.longnameToUrl).forEach(function(longname) {
    const myModules = helper.find(modules, { longname: longname });

    if (myModules.length) {
      generate(
        'Module',
        myModules[0].name,
        myModules,
        helper.longnameToUrl[longname]
      );
    }

    const myClasses = helper.find(classes, { longname: longname });

    if (myClasses.length) {
      generate(
        'Class',
        myClasses[0].name,
        myClasses,
        helper.longnameToUrl[longname]
      );
    }

    const myNamespaces = helper.find(namespaces, { longname: longname });

    if (myNamespaces.length) {
      generate(
        'Namespace',
        myNamespaces[0].name,
        myNamespaces,
        helper.longnameToUrl[longname]
      );
    }

    const myMixins = helper.find(mixins, { longname: longname });

    if (myMixins.length) {
      generate(
        'Mixin',
        myMixins[0].name,
        myMixins,
        helper.longnameToUrl[longname]
      );
    }

    const myExternals = helper.find(externals, { longname: longname });

    if (myExternals.length) {
      generate(
        'External',
        myExternals[0].name,
        myExternals,
        helper.longnameToUrl[longname]
      );
    }

    const myInterfaces = helper.find(interfaces, { longname: longname });

    if (myInterfaces.length) {
      generate(
        'Interface',
        myInterfaces[0].name,
        myInterfaces,
        helper.longnameToUrl[longname]
      );
    }
  });

  // TODO: move the tutorial functions to templateHelper.js
  function generateTutorial(title, tutorial, filename) {
    const tutorialData = {
      title: title,
      header: tutorial.title,
      content: tutorial.parse(),
      children: tutorial.children
    };

    const tutorialPath = path.join(outdir, filename);
    let html = view.render('tutorial.tmpl', tutorialData);

    // yes, you can use {@link} in tutorials too!
    html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>

    fs.writeFileSync(
      tutorialPath,
      htmlMinify.minify(html, HTML_MINIFY_OPTIONS),
      'utf8'
    );
  }

  // tutorials can have only one parent so there is no risk for loops
  function saveChildren(node) {
    node.children.forEach(function(child) {
      generateTutorial(
        'Tutorial: ' + child.title,
        child,
        helper.tutorialToUrl(child.name)
      );
      saveChildren(child);
    });
  }

  saveChildren(tutorials);
};
