/***** BEGIN LICENSE BLOCK *****
   - Version: MPL 1.1/GPL 2.0/LGPL 2.1
   -
   - The contents of this file are subject to the Mozilla Public License Version
   - 1.1 (the "License"); you may not use this file except in compliance with
   - the License. You may obtain a copy of the License at
   - http://www.mozilla.org/MPL/
   -
   - Software distributed under the License is distributed on an "AS IS" basis,
   - WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
   - for the specific language governing rights and limitations under the
   - License.
   -
   - The Original Code is "CHM Reader".
   -
   - The Initial Developer of the Original Code is Denis Remondini.
   - Portions created by the Initial Developer are Copyright (C) 2005-2006 Denis Remondini.  
   - All Rights Reserved.
   -
   - Contributor(s): Ling Li <lilingv AT gmail DOT com>
   -
   - Alternatively, the contents of this file may be used under the terms of
   - either the GNU General Public License Version 2 or later (the "GPL"), or
   - the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
   - in which case the provisions of the GPL or the LGPL are applicable instead
   - of those above. If you wish to allow use of your version of this file only
   - under the terms of either the GPL or the LGPL, and not to allow others to
   - use your version of this file under the terms of the MPL, indicate your
   - decision by deleting the provisions above and replace them with the notice
   - and other provisions required by the LGPL or the GPL. If you do not delete
   - the provisions above, a recipient may use your version of this file under
   - the terms of any one of the MPL, the GPL or the LGPL.
   -
   - 
***** END LICENSE BLOCK *****/

function on_open_chm(e)
{
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"]
                       .createInstance(nsIFilePicker);
    fp.init(window, "Open CHM File", nsIFilePicker.modeOpen);

    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                          .getService(Components.interfaces.nsIPrefBranch);
    var dir;
    if (prefs.getPrefType("chmreader.opendir") == prefs.PREF_STRING){
        dir = prefs.getCharPref("chmreader.opendir");
        var path = Components.classes["@mozilla.org/file/local;1"]
                             .createInstance(Components.interfaces.nsILocalFile);
        path.initWithPath(unescape(dir));
        fp.displayDirectory = path;
    }

    fp.appendFilter("Compiled HTML Help", "*.chm;*.CHM");
    fp.appendFilters(nsIFilePicker.filterAll);
    var res = fp.show();
    if (res == nsIFilePicker.returnOK) {
        // Save path
        prefs.setCharPref("chmreader.opendir", escape(fp.file.parent.path));

        var path = encodeURI(fp.file.path);

        var b;
        if (e.target.id == 'CHMReaderOpenFilesItem' ||
            e.target.id == 'tb-chmreader-open') {
            // Call from main window
            b = getBrowser();
        } else {
            // Call from sidebar
            b = window.parent.getBrowser();
        }
        b.loadURI("chm:file://" + path);
    }
}


// BEGIN of the code modified from the PDF Download extension

const nsIWBP = Components.interfaces.nsIWebBrowserPersist;

//------------------------------------------------------------------------------
// Retrieve remote CHM file (possibly from cache), store locally and load it

function chm_fetch_and_load_remote_file(url,fname,intab) {

    var userinfo = Components.classes["@mozilla.org/userinfo;1"]
                           .createInstance(Components.interfaces.nsIUserInfo);

    var tmpdir = Components.classes["@mozilla.org/file/directory_service;1"]
                           .getService(Components.interfaces.nsIProperties)
                           .get("TmpD", Components.interfaces.nsIFile);

    var dir;
    if (tmpdir.path == "/tmp" && userinfo.username) {
        tmpdir.append("mozchmreader-" + userinfo.username).path;
    } else {
        tmpdir.append("mozchmreader");
    }
    dir = tmpdir.path;

    var localTarget = Components.classes['@mozilla.org/file/local;1']
                                .createInstance(Components.interfaces.nsILocalFile);
    localTarget.initWithPath(dir);

    if (!localTarget.exists())
        localTarget.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0770);

    dir = localTarget.clone();
    var file = encodeURIComponent(url).replace(/[%]/g,"_");

    localTarget.append(file);

    var uri_src = Components.classes["@mozilla.org/network/standard-url;1"]
                            .createInstance(Components.interfaces.nsIURI);

    var referer = Components.classes["@mozilla.org/network/standard-url;1"]
                            .createInstance(Components.interfaces.nsIURI);

    uri_src.spec = url;
    referer.spec = getCurrentLocation();

    // Get ready to transfer the CHM file
    var progressPersist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
                                    .createInstance(Components.interfaces.nsIWebBrowserPersist);

    var flags = nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION
              | nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;

    progressPersist.persistFlags = flags;

    var tr = Components.classes["@mozilla.org/transfer;1"]
                       .createInstance(Components.interfaces.nsITransfer);
    tr.init(uri_src, makeFileURI(localTarget), "", null, null, null, progressPersist);

    // Override tr to load the file after its transfer is complete. Is there a more elegant way to do this?
    var proglistener = {
        QueryInterface: function(aIID) {
         if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
             aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
             aIID.equals(Components.interfaces.nsISupports))
             return this;
         throw Components.results.NS_NOINTERFACE;
        },

        tr: null,
        uri: null,
        intab: null,

        init: function(tr_i, uri_i, intab_i) { this.tr = tr_i; 
                                      this.uri = uri_i;
                                      this.intab = intab_i; },

        onLocationChange: function(progress, request, loc) {
            return tr.onLocationChange(progress, request, loc);
        },

        onSecurityChange: function(progress, request, state) {
            return tr.onSecurityChange(progress, request, state);},

        onStatusChange: function(progress, request, stat, msg) {
            return tr.onStatusChange(progress, request, stat, msg);
        },

        onProgressChange: function(progress, request, curSelf, maxSelf, curTot, maxTot) {
            return tr.onProgressChange(progress, request, curSelf, maxSelf, curTot, maxTot);
        },

        // The override
        onStateChange: function(progress, request, flags, stat) {
            if (flags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
                chm_load_local_uri_in_browser(this.uri, this.intab);
            return tr.onStateChange(progress, request, flags, stat); 
        }
    };

    var uri_dst= "file://" + dir.path + "/" + file;
    proglistener.init (tr, uri_dst, intab);
    progressPersist.progressListener = proglistener;

    var cacheKey = Components.classes['@mozilla.org/supports-string;1']
                             .createInstance(Components.interfaces.nsISupportsString);
    cacheKey.data = url;

    // Finally set the transfer off
    progressPersist.saveURI(uri_src, cacheKey, referer, null, null, localTarget);
}

//------------------------------------------------------------------------------
// 

function chm_load_local_uri_in_browser(uri,intab) {
    var fph = Components.classes['@mozilla.org/network/protocol;1?name=file']
                        .createInstance(Components.interfaces.nsIFileProtocolHandler);
    var f = fph.getFileFromURLSpec(uri);
    uri = "chm:file://" + encodeURI(f.path);

    if (intab) {
        var tab = getBrowser().addTab(uri);
        if (chm_should_new_tab_get_focus()) 
            getBrowser().selectedTab = tab;
    } else {
        getBrowser().loadURI(uri);
    }
}

//------------------------------------------------------------------------------
//

function chm_handle_url(url,intab) {
    if (chm_is_link_type("file:",url)) {  
        chm_load_local_uri_in_browser (url, intab);
    } else {
        var fname = decodeURIComponent(url.substring(url.lastIndexOf('/') + 1));
        chm_fetch_and_load_remote_file(url, fname, intab);
    }
}

//------------------------------------------------------------------------------
//

function chm_mouse_click_handler(aEvent) {

    if (!aEvent)
        return;

    // if right click, we do not do anything
    if (aEvent.button == 2)
        return;

    // if Shift key and Ctrl key were pressed, it means that the user wants to open the PDF file without "PDF Download"
    if (aEvent.shiftKey && aEvent.ctrlKey) 
        return;

    if (aEvent.target)
        var targ = aEvent.originalTarget;

    // BEGIN of the code taken by an extension written by Ben Basson (Cusser)
    if (targ.tagName.toUpperCase() != "A")
    {
        // Recurse until reaching root node
        while (targ.parentNode) {
            targ = targ.parentNode;
            // stop if an anchor is located
            if (targ.tagName && targ.tagName.toUpperCase() == "A")
                break;
        }
        if (!targ.tagName || targ.tagName.toUpperCase() != "A")
            return;
    }
    // END of the code taken by an extension written by Ben Basson (Cusser)
    

    // Middle click for new tab
    var intab = 0;
    if (aEvent.button == 1)
        intab = 1;

    var url = targ.getAttribute("href");  
    if (url == null) return;

    // remove heading spaces
    url = url.replace(/^\s+/, '');
     
    // we check if the link is absolute or not
    if ( (!chm_is_link_type("http", url)) && (!chm_is_link_type("file:",url)) && (!chm_is_link_type("ftp",url)) ) {
        // the link is not absolute, hence we need to build the absolute link
        var dir = getBaseUrl();
        dir = dir.substring(0,dir.lastIndexOf('/')+1);
        var pos = url.indexOf('/');
        if (pos == 0) {
            pos = dir.indexOf('/');
            pos = dir.indexOf('/',pos+1);
            pos = dir.indexOf('/',pos+1);
            url = dir.substr(0,pos) + url;
        } else {
            url = dir + url;
        }
    } 

    // if it is a javascript link, we do not do anything
    if (url.toLowerCase().indexOf('javascript:') != -1)
        return;

    //retrieve the url from a google link
    if ((url.match(/^http:\/\/[a-z.]+google.[a-z.]+\/url\?/i)) && (url.match(/[\\?&]url=([^&#]+)/i))) {
        url = decodeURIComponent(RegExp.$1);
    }
    // special case for yahoo search results
    if (url.match(/^http:\/\/[a-z.]+yahoo.[a-z.]+\//i) && (url.match(/\/\*\*([^&#]+)/i))) {
        url = decodeURIComponent(RegExp.$1);
    }
      
    var originalUrl = url;
    // we remove eventual parameters in the url    
    var firstSharpPosition = url.indexOf('#');  
    if (firstSharpPosition != -1) {
        url = url.substring(0,firstSharpPosition);
    } 
    var firstQuestionMarkPosition = url.indexOf('?');  
    if (firstQuestionMarkPosition != -1) {
        url = url.substring(0,firstQuestionMarkPosition);
    } 

    // we check if the link points to a chm file
    var lastDotPosition = url.lastIndexOf('.');
    var ext = url.substring(lastDotPosition + 1,lastDotPosition + 4);

    // we check if the extension is part of a directory name or if it is a real filename extension
    var lastSlashPosition = url.lastIndexOf('/');
    if (lastSlashPosition > lastDotPosition) {  
        // the extension we found is not the filename extension but it is part of a directory name
        // ex: http://groups.google.com/group/comp.text.pdf/browse_thread/thread/a7e39729ab3bc5d/9d9408322b2a77ff
        return;
    }

    if (ext.toLowerCase() == "chm") {
        chm_handle_url(url, intab);
        aEvent.preventDefault();
        aEvent.stopPropagation();  
    }
}

//------------------------------------------------------------------------------
// 

function chm_should_new_tab_get_focus() {
    var focusNewTab;
    try {
        focusNewTab = !sltPrefs.getBoolPref("browser.tabs.loadInBackground");
    } catch(ex) {
        focusNewTab = false;
    }
    return focusNewTab;
}

//------------------------------------------------------------------------------
// Checks the type of a link

function chm_is_link_type (linktype, link) {
    try {
        var protocol = link.substr(0, linktype.length);
        return protocol.toLowerCase() == linktype;
    } catch(e) {
        return false;
    }
}

//------------------------------------------------------------------------------
// Display message on javascript console 

function chm_log(msg) {
    var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
    consoleService.logStringMessage("CHM Reader : " + msg);
}

//------------------------------------------------------------------------------
// Hook mouse click

function chm_init() {
    getBrowser().addEventListener("click", chm_mouse_click_handler, true);
}

function chm_uninit() {
    getBrowser().removeEventListener("click", chm_mouse_click_handler, true);
}

function getCurrentLocation() {
    return document.commandDispatcher.focusedWindow.location.href;
}       

//find the base URL for the document
function getBaseUrl() {
    var dir = getCurrentLocation();
    var baseTag = window._content.document.getElementsByTagName('base')[0];
    if (baseTag != null) {
        if ((baseTag.href != null) && (baseTag.href != "")) {
            dir = baseTag.href;
        }
    }
    return dir;
}

window.addEventListener("load", chm_init, false);
window.addEventListener("unload", chm_uninit,false);

// END of the code modified from the PDF Download extension
