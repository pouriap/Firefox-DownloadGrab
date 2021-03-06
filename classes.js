'use strict';

//todo: store options in sync, what's wrong with me?
//todo: save downloads list
//todo: policies:
/*
- Add-ons must only request those permissions that are necessary for function
- Add-ons should avoid including duplicate or unnecessary files
- Add-on code must be written in a way that is reviewable and understandable. 
Reviewers may ask you to refactor parts of the code if it is not reviewable.
- You may include third-party libraries in your extension. In that case, when you upload 
your extension to AMO, you will need to provide links to the library source code.
- The add-on listing should have an easy-to-read description about everything it does, 
and any information it collects. Please consult our best practices guide for creating
 an appealing listing.
 - If the add-on uses native messaging, the privacy policy must clearly disclose which 
information is being exchanged with the native application. Data exchanged with the 
native application must be in accordance with our No Surprises policy.
*/
//todo: how firefox determines mime types:
//https://developer.mozilla.org/en-US/docs/Mozilla/How_Mozilla_determines_MIME_Types
//todo: support "download selection"
//todo: I18N
//todo: do this automatically for files like this from now on


/**
 * This is the main application class and holds all states
 * An instance of this is created in init.js as a global variable accessible
 * to anyonw who has access to 'background.js' scope
 */
class DlGrabApp {

	/**
	 * 	
	 * @param {Options} opMan 
	 */
	constructor(availableDMs) {
		// all requests made by Firefox are stored here temporarily until we get their response
		this.allRequests = new FixedSizeMap(100);
		// this will be set in applyOptions()
		this.allDownloads = {}
		// open download dialogs
		this.downloadDialogs = {};
		// runtime data
		this.runtime = {};
		this.runtime.availableDMs = availableDMs;
	}

	async init(){
		let options = await Options.load();
		this.applyOptions(options);
	}

	applyOptions(options){
		this.options = options;
		//create a new list of downloads in case the downloas history size is changed in options
		this.allDownloads = new FixedSizeMap(options.dlListSize, this.allDownloads.list);
		//exclusion,inclusion,download lists
		this.options.excludedExts = _getExtsFromList(options.excludedExts);
		this.options.excludedMimes = _getMimesForExts(this.options.excludedExts);
		this.options.includedExts = _getExtsFromList(options.includedExts);
		this.options.includedMimes = _getMimesForExts(this.options.includedExts);
		this.options.forcedExts = _getExtsFromList(options.forcedExts);
		this.options.forcedMimes = _getMimesForExts(this.options.forcedExts);
		this.options.blacklistDomains = _getValuesFromList(this.options.blacklistDomains);

		function _getExtsFromList(extList){
			if(!extList){
				return [];
			}
			let extsArr = [];
			//remove spaces
			extList = extList.replace(/\s/g, '');
			for(let ext of extList.split(',')){
				//remove dot in case people have put dots in ext list
				if(ext.startsWith('.')){
					ext = ext.substr(1);
				}
				extsArr.push(ext);
			}
			return extsArr;
		}
		function _getMimesForExts(extsArr){
			if(!extsArr){
				return [];
			}
			let mimesArr = [];
			for(let ext of extsArr){
				let mimesOfExt = constants.extsToMimes[ext];
				if(mimesOfExt){
					mimesArr = mimesArr.concat(mimesOfExt);
				}
			}
			return mimesArr;
		}
		function _getValuesFromList(list){
			if(!list){return [];}
			//remove spaces
			list = list.replace(/\s/g, '');
			return list.split(',');
		}
	}

	/**
	 * Adds a download to our main list of downloads
	 * @param {Download} download 
	 */
	addToAllDownloads(download){
		//we do this here because we don't want to run hash on requests we will not use
		let hash = download.getHash();
		//we put hash of URL as key to prevent the same URL being added by different requests
		this.allDownloads.put(hash, download);
	}

	/**
	 * opens the download dialog
	 * here's how things happen because WebExtensions suck ass:
	 * we open the download dialog window
	 * we store the windowId along with the associated download's hash in app.downloadDialogs
	 * after the dialog loads it sends a message to the background script requesting the download hash
	 * background script gives download dialogs the hash based on the windowId 
	 * download dialog gets the Download object from the hash and populates the dialog
	 * before the dialog is closed it sends a message to the background script telling it to delete the hash to free memory
	 * @param {Download} dl 
	 */
	showDlDialog(dl) {

		var download = dl;
		let screenW = window.screen.width;
		let screenH = window.screen.height;
		let windowW = 480;
		let windowH = 350;
		let leftMargin = (screenW/2) - (windowW/2);
		let topMargin = (screenH/2) - (windowH/2);

		let createData = {
			type: "detached_panel",
			titlePreface: download.getFilename(),
			url: "popup/download.html",
			allowScriptsToClose : true,
			width: windowW,
			height: windowH,
			left: leftMargin,
			top: topMargin
		};
		let creating = browser.windows.create(createData);

		var appInstance = this;
		creating.then((windowInfo) => {
			let windowId = windowInfo.id;
			appInstance.downloadDialogs[windowId] = download.getHash();
		});
	}

	getDefaultDM(){
		return this.options.defaultDM || this.runtime.availableDMs[0];
	}

}


class Download {

	/**
	 * Creates a new Download object
	 * @param {object} reqDetails the 'details' object attached to a request
	 * @param {object} resDetails the 'details' object attached to a response
	 */
	constructor(reqDetails, resDetails){
		this.requestId = resDetails.requestId;
		this.url = resDetails.url;
		this.statusCode = resDetails.statusCode;
		this.time = resDetails.timeStamp;
		this.resourceType = resDetails.type;
		this.origin = reqDetails.originUrl || "N/A";
		this.reqDetails = reqDetails;
		this.resDetails = resDetails;
	}

	getHash(){
		if(typeof this.hash === 'undefined'){
			this.hash = md5(this.url);
		}
		return this.hash;
	}

	/**
	 * gets a header associated with this reqeust
	 * @param {string} headerName name of the header
	 * @param {string} headerDirection either "request" or "response"
	 */
	getHeader(headerName, headerDirection){

		let headers;
		if(headerDirection === 'request'){
			headers = this.reqDetails.requestHeaders;
		}
		else{
			headers = this.resDetails.responseHeaders;
		}

		let headerItem =  headers.find(function(header){
			return header.name.toLowerCase() === headerName.toLowerCase();
		});

		if(headerItem){
			return headerItem.value;
		}
		else{
			return undefined;
		}

	}

	/**
	 * get file name (if available) of the resouce requested
	 * @returns file name or "unknown" if now available
	 */
	getFilename(){

		if(typeof this.filename === "undefined"){

			this.filename = "unknown";

			let disposition = this.getHeader('content-disposition', 'response');
			if(disposition){
				const regex1 = /filename\*=["']?(.*?\'\')?(.*?)["']?(;|$)/im;
				const regex2 = /filename=["']?(.*?)["']?(;|$)/im;
				//first try filename*= because it takes precedence according to docs
				let matches = disposition.match(regex1);
				if(matches && matches[2]){
					this.filename = decodeURI(matches[2]);
				}
				//then look for filename=
				else{
					matches = disposition.match(regex2);
					if(matches && matches[1]){
						this.filename = decodeURI(matches[1]);
					}
				}

			}
			//use URL if content-disposition didn't provide a file name
			if(this.filename === "unknown"){
				let filename = Utils.getFileName(this.url);
				if(filename){
					this.filename = filename;
				}
			}
			//if the url has no file extension give it a serial number
			//useful for urls like 'media.tenor.com/videos/9dd6603af0ac712c6a38dde9255746cd/mp4'
			//where lots of resources have the same path and hence the same filename
			if(this.filename !== "unknown" && this.filename.indexOf(".") === -1){
				this.filename = this.filename + "_" + this.requestId;
				//try to guess the file extension based on mime type
				let mimeType = this.getHeader('content-type', 'response');
				let extension = constants.mimesToExts[mimeType];
				if(extension){
					this.filename = `${this.filename}.${extension}`;
				}
			}

		}

		return this.filename;
	}

	getHost(){

		if(typeof this.host === "undefined"){
			this.host = "unknown";
			let host = this.getHeader("host", "request");
			if(host){
				this.host = host;
			}
		}

		return this.host;
	}

	/**
	 * get content-length (if available) of the resource requested
	 * @returns size in MB or "unknown" if not available
	 */
	getSize(){

		if(typeof this.fileSize === "undefined"){

			this.fileSize = "unknown";

			let contentLength = this.getHeader("content-length", "response");
			let size = Number(contentLength);
			if(Number.isInteger(size)){
				this.fileSize = size;
			}
		}

		return this.fileSize;
	}

	/**
	 * gets the extension of the resource requested (if available)
	 * @returns the extension in lower case or "unknown" if no extension if available
	 */
	getFileExtension(){

		if(typeof this.fileExtension === "undefined"){

			this.fileExtension = "unknown";

			let ext = Utils.getExtFromFileName(this.getFilename());
			if(ext){
				this.fileExtension = ext;
			}
		}

		return this.fileExtension;
	}

}

//todo: i'm not loving how this is now coupled with options
class ReqFilter {

	/**
	 * 
	 * @param {Download} download 
	 */
	constructor(download, options){
		this.download = download;
		this.options = options;
	}

	/* private funcitons */

	/**
	 * 
	 * @param {array} list 
	 */
	_isInProtocolList(list){
		for(let protocol of list){
			if(this.download.url.startsWith(protocol)){
				return true;
			}
		}
		return false;
	}

	/**
	 * 
	 * @param {array} list 
	 */
	_isInExtensionList(list){
		let extension = this.download.getFileExtension();
		if (extension !== "unknown" && list.includes(extension)) {
			return true;
		}
		return false;
	}

	/**
	 * 
	 * @param {array} list 
	 */
	_isInMimeList(list){
		let mime = this.download.getHeader("content-type", "response");
		if (mime){
			mime = mime.toLowerCase();
			for(let listMime of list){
				//we search for the mime's occurence in the content-type because sometimes 
				//content-type has other things in it as well
				if(mime.indexOf(listMime) !== -1){
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * 
	 * @param {array} list list of webRequest.ResourceTypes 
	 */
	_isInTypeList(list){
		return list.includes(this.download.resourceType);
	}

	
	/* public functions */

	isSizeBlocked(){
		let sizeLimit = this.options.grabFilesLargerThanMB * 1000000;
		let size = this.download.getSize();
		if(size === 0){
			return true;
		}
		return size !== 'unknown' && size < sizeLimit;
	}

	isWebSocket(){
		if(typeof this._isWebSocket === 'undefined'){
			this._isWebSocket = 
				this._isInTypeList(constants.webSocketTypes) ||
				this._isInProtocolList(constants.webSocketProtos);
		}
		return this._isWebSocket; 
	}

	isImage(){
		if(typeof this._isImage === 'undefined'){
			this._isImage = 
			this._isInTypeList(constants.imageTypes) ||
			this._isInExtensionList(constants.imageExts) ||
			this._isInMimeList(constants.imageMimes);
		}
		return this._isImage;
	}

	isWebImage(){
		if(typeof this._isWebImage === 'undefined'){
			this._isWebImage = this._isInTypeList(constants.imageTypes);
		}
		return this._isWebImage;
	}

	isFont(){
		if(typeof this._isFont === 'undefined'){
			this._isFont = 
				this._isInTypeList(constants.fontTypes) ||
				this._isInExtensionList(constants.fontExts) ||
				this._isInMimeList(constants.fontMimes);
		}
		return this._isFont;
	}

	isWebFont(){
		if(typeof this._isWebFont === 'undefined'){
			this._isWebFont = this._isInTypeList(constants.fontTypes);
		}
		return this._isWebFont;
	}

	isTextual(){
		if(typeof this._isTextual === 'undefined'){
			this._isTextual = 
				this._isInTypeList(constants.textualTypes) ||
				this._isInExtensionList(constants.textualExts) ||
				this._isInMimeList(constants.textualMimes);
		}
		return this._isTextual;
	}

	isWebTextual(){
		if(typeof this._isWebTextual === 'undefined'){
			this._isWebTextual = false;
			if(this._isInTypeList(constants.textualTypes)){
				this._isWebTextual = true;
			}
			//if its content-type is text/plain then it'll be shown in browser
			//for example seeing a .js file in github raw
			else if(this._isInMimeList(['text/plain'])){
				this._isWebTextual = false;
			}
			else if(
				this._isInExtensionList(constants.textualExts) ||
				this._isInMimeList(constants.textualMimes)
			){
				this._isWebTextual = true;
			}
		}
		return this._isWebTextual;
	}

	isOtherWebResource(){
		if(typeof this._isWebResource === 'undefined'){
			this._isWebSocket = this._isInTypeList(constants.otherWebTypes);
		}
		return this._isWebSocket;
	}

	isMedia(){
		if(typeof this._isMedia === 'undefined'){
			this._isMedia = 
				//media type is anything that is loaded from a <video> or <audio> tag
				//the problem with them is that if they are cached, there is absolutely no way to re-create
				//the request and trigger a grab
				//i expected a request to be created with 'fromCache=true' but that is not the case
				//i tried ctrl+f5 and disabling cache from network tool but they don't work
				//the request doesn't even show up in the network tool
				//proof: MDN or w3schools page on <video> and <audio> tag
				//the only way is to open the page containing the resouce in a private window
				this._isInExtensionList(constants.mediaExts) ||
				this._isInMimeList(constants.mediaMimes);
		}
		return this._isMedia;
	}

	isBrowserMedia(){
		if(typeof this._isBrowserMedia === 'undefined'){
			this._isBrowserMedia = this._isInTypeList(constants.mediaTypes);
		}
		return this._isBrowserMedia;
	}

	/**
	 * media file that can be played inside Firefox
	 * reference: https://support.mozilla.org/en-US/kb/html5-audio-and-video-firefox
	 */
	isDisplayedInBrowser(){
		if(typeof this._isDisplayedInBrowser === 'undefined'){
			if(!this.options.playMediaInBrowser){
				this._isDisplayedInBrowser = false;
			}
			else{
				this._isDisplayedInBrowser = 
					this._isInTypeList(constants.mediaTypes) ||
					this._isInExtensionList(constants.disPlayableExts) ||
					this._isInMimeList(constants.disPlayableMimes);
			}
		}
		return this._isDisplayedInBrowser;
	}

	isCompressed(){
		if(typeof this._isCompressed === 'undefined'){
			this._isCompressed = 
				this._isInExtensionList(constants.compressedExts) ||
				this._isInMimeList(constants.compressedMimes);
		}
		return this._isCompressed;
	}

	isDocument(){
		if(typeof this._isDocument === 'undefined'){
			this._isDocument = 
				this._isInExtensionList(constants.documentExts) ||
				this._isInMimeList(constants.documentMimes);
		}
		return this._isDocument;
	}

	isOtherBinary(){
		if(typeof this._isOtherBinary === 'undefined'){
			this._isOtherBinary = 
				this._isInExtensionList(constants.binaryExts) ||
				this._isInMimeList(constants.generalBinaryMimes);
		}
		return this._isOtherBinary;
	}

	/**
	 * does this request have an "attachment" header?
	 */
	hasAttachment(){
		if(typeof this._hasAttachment === 'undefined'){
			let disposition = this.download.getHeader('content-disposition', 'response');
			//apparently firefox considers requests as download even if attachment is not set
			//and only content-disposition is set
			//example: https://www.st.com/resource/en/datasheet/lm317.pdf even if we tamper
			//content-disposition into something like "blablabla" firefox still shows download dialog
			this._hasAttachment = ( disposition && disposition.toLowerCase().indexOf("inline") === -1 );
		}
		return this._hasAttachment;
	}

	isAJAX(){
		if(typeof this._isAJAX === 'undefined'){
			this._isAJAX = this._isInTypeList(constants.ajaxTypes);
		}
		return this._isAJAX;
	}

	isStatusOK(){

		if(typeof this._isStatusOK === 'undefined'){

			this._isStatusOK = false;

			//OK and Not-Modified are ok
			if(this.download.statusCode == 200 || this.download.statusCode == 304){
				this._isStatusOK = true;
			}
			else if(this.download.statusCode == 206){
				//if server is sending a range while we haven't requested it then it's not OK
				//because Firefox will send another request in this case and we will end up with 
				//two responses for the same requestId
				//example: the bookmarked download of firefox
				let contentRange = this.download.getHeader('content-range', 'response');
				if(contentRange){
					//it's okay if server is responsing with a range starting from zero, even if we 
					//have not requested a range
					if(contentRange.indexOf('bytes 0-') !== -1){
						this._isStatusOK = true;
					}
					//if server is sending a range which does not start from zero and we have
					//not requested a range then this is not ok
					else if(!this.download.getHeader('range', 'request')){
						this._isStatusOK = false;
					}
				}
				else{
					this._isStatusOK = true;
				}
			}
		}

		return this._isStatusOK;
	}

	isFromCache(){
		return this.download.resDetails.fromCache;
	}

	isExcludedInOpts(){
		if(typeof this._isExcludedInOpts === 'undefined'){
			if(this._isInExtensionList(this.options.excludedExts)){
				this._isExcludedInOpts = true; 
			}
			else if(this._isInMimeList(this.options.excludedMimes)){
				this._isExcludedInOpts = true;
			}
			else{
				this._isExcludedInOpts = false;
			}
		}

		return this._isExcludedInOpts;
	}

	isIncludedInOpts(){
		if(typeof this._isIncludedInOpts === 'undefined'){
			if(this._isInExtensionList(this.options.includedExts)){
				this._isIncludedInOpts = true; 
			}
			else if(this._isInMimeList(this.options.includedMimes)){
				this._isIncludedInOpts = true;
			}
			else{
				this._isIncludedInOpts = false;
			}
		}

		return this._isIncludedInOpts;
	}

	isForcedInOpts(){
		if(typeof this._isForcedInOpts === 'undefined'){
			if(this._isInExtensionList(this.options.forcedExts)){
				this._isForcedInOpts = true; 
			}
			else if(this._isInMimeList(this.options.forcedMimes)){
				this._isForcedInOpts = true;
			}
			else{
				this._isForcedInOpts = false;
			}
		}

		return this._isForcedInOpts;
	}

	isBlackListed(blacklist){
		if(blacklist.includes(this.download.url)){
			return true;
		}
		if(
			this.options.blacklistDomains.includes(this.download.getHost()) ||
			this.options.blacklistDomains.includes(Utils.getDomain(this.download.origin))
		){
			return true;
		}
		return false;
	}

	isTypeWebRes(){
		if(typeof this._isTypWebRes === 'undefined'){
			this._isTypWebRes = this._isInTypeList(constants.webResTypes);
		}
		return this._isTypWebRes;
	}

	isTypeWebOther(){
		if(typeof this._isTypWebOther === 'undefined'){
			this._isTypWebOther = this._isInTypeList(constants.webOtherTypes);
		}
		return this._isTypWebOther;
	}

	isTypeMedia(){
		if(typeof this._isTypMedia === 'undefined'){
			this._isTypMedia = this._isInTypeList(constants.mediaTypes);
		}
		return this._isTypMedia;
	}

	isMimeWebRes(){
		return this._isInMimeList(constants.webResMimes);
	}
	isMimeWebOther(){
		return this._isInMimeList(constants.webOtherMimes);
	}
	isMimeMedia(){
		return this._isInMimeList(constants.mediaMimes);
	}
	isMimeCompressed(){
		return this._isInMimeList(constants.compressedMimes);
	}
	isMimeDocument(){
		return this._isInMimeList(constants.documentMimes);
	}
	isMimeGeneralBinary(){
		return this._isInMimeList(constants.generalBinaryMimes);
	}

	isExtWebRes(){
		return this._isInExtensionList(constants.webResExts);
	}
	isExtWebOther(){
		return this._isInExtensionList(constants.webOtherExts);
	}
	isExtMedia(){
		return this._isInExtensionList(constants.mediaExts);
	}
	isExtCompressed(){
		return this._isInExtensionList(constants.compressedExts);
	}
	isExtDocument(){
		return this._isInExtensionList(constants.documentExts);
	}
	isExtBinary(){
		return this._isInExtensionList(constants.binaryExts);
	}

	
}
//todo: change these to numbers
//categories of file types
ReqFilter.CAT_WEB_RES = 'web res';
ReqFilter.CAT_WEBRES_API = 'web res api';
ReqFilter.CAT_OTHER_WEB = 'other web';
ReqFilter.CAT_OTHERWEB_API = 'other web api';
ReqFilter.CAT_MEDIA_API = 'media api';
ReqFilter.CAT_FILE_MEDIA = 'media file';
ReqFilter.CAT_FILE_COMP = 'compressed file';
ReqFilter.CAT_FILE_DOC = 'document file';
ReqFilter.CAT_FILE_BIN = 'binary file';
ReqFilter.CAT_UKNOWN = 'unknown';

//classes of requests
ReqFilter.CLS_INLINE_WEB_RES = 'web res';
ReqFilter.CLS_INLINE_MEDIA = 'web media';
ReqFilter.CLS_WEB_OTHER = 'web page';
ReqFilter.CLS_DOWNLOAD = 'download';

//types of action
ReqFilter.ACT_GRAB = 'grab';
ReqFilter.ACT_IGNORE = 'ignore';
ReqFilter.ACT_FORCE_DL = 'force dl';
ReqFilter.ACT_GRAB_SILENT = 'grab silent';

/**
 * A fixed sized map with key->value pairs
 * When size gets bigger than the limit, first element is deleted 
 * and the new element is put in
 * Duplicate elements will rewrite the old ones
 */
class FixedSizeMap {

	/**
	 * 
	 * @param {int} size 
	 * @param {object} listData (optional) the data to initialize this FixedSizeMap with
	 */
	constructor(size, listData) {
		size = (Number(size));
		this.limit = isNaN(size) ? 100 : size;
		this.list = (listData) ? this._trimListData(listData, size) : {};
	}

	getKeys() {
		return Object.keys(this.list);
	};

	getValues() {
		return Object.values(this.list);
	};

	getSize() {
		return this.getKeys().length;
	};

	remove(key) {
		delete this.list[key];
	};

	put(key, value) {
		if (this.getSize() === this.limit) {
			let firstItemKey = this.getKeys()[0];
			this.remove(firstItemKey);
		}
		this.list[key] = value;
	};

	get(key) {
		return this.list[key];
	};

	_trimListData(listData, targetSize) {
		let keys = Object.keys(listData);
		let size = keys.length;
		if (targetSize < size) {
			let diff = size - targetSize;
			for (let i = 0; i < diff; i++) {
				let k = keys[i];
				delete listData[k];
			}
		}
		return listData;
	}
	
}

var constants = {

	dateForamt : { hour: 'numeric', minute:'numeric', month: 'short', day:'numeric' },

	webSocketProtos : ["ws://", "wss://"],
	webSocketTypes: ['websocket'],




	webResTypes: ['stylesheet', 'script', 'font', 'image', 'imageset'],
	webOtherTypes: [
		'xbl', 'xml_dtd', 'xslt', 'web_manifest', 
		'object', 'beacon', 'csp_report', 'object_subrequest', 'ping', 'speculative'
	],
	webResMimes: [
		'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/vnd.microsoft.icon', 
		'image/bmp', 'image/webp', 'image/tiff',
		'font/ttf', 'font/otf', 'application/vnd.ms-fontobject', 'font/woff', 'font/woff2', 
		'text/css', 'text/javascript', 'application/javascript',
	],
	webOtherMimes: [
		'text/html', 'application/xhtml+xml', 'application/json', 'application/ld+json', 
		'application/xml', 'text/xml', 'application/php', 
	],
	webResExts: [
		'jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'bmp', 'webp', 'tif', 'tiff',
		'ttf', 'otf', 'eot', 'woff2', 'woff',
		'css', 'js',
	],
	webOtherExts: [
		'html', 'htm', 'dhtml', 'xhtml', 'json', 'jsonld', 'xml', 'rss',
		'php', 'php3', 'php5', 'asp', 'aspx', 'jsp', 'jspx',
	],



	imageExts: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'bmp', 'webp', 'tif', 'tiff'],
	imageMimes: [
		'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/vnd.microsoft.icon', 
		'image/bmp', 'image/webp', 'image/tiff',
	],
	imageTypes: ['image', 'imageset'],


	fontExts: ['ttf', 'otf', 'eot', 'woff2', 'woff'],
	fontMimes: [
		'font/ttf', 'font/otf', 'application/vnd.ms-fontobject', 'font/woff', 'font/woff2', 
	],
	fontTypes: [
		'font'
	],


	textualExts : [
		//static content
		'css', 'js', 'html', 'htm', 'dhtml', 'xhtml', 'json', 'jsonld', 'xml', 'rss',
		//dynamic pages
		'php', 'php3', 'php5', 'asp', 'aspx', 'jsp', 'jspx',
	],
	textualMimes : [
		//static content
		'text/css', 'text/javascript', 'application/javascript', 'text/html', 'application/xhtml+xml', 
		'application/json', 'application/ld+json', 'application/xml', 'text/xml',
		//dynamic pages
		'application/php', 
	],
	textualTypes: ['stylesheet', 'script', 'xbl', 'xml_dtd', 'xslt', 'web_manifest'],


	otherWebTypes: ['object', 'beacon', 'csp_report', 'object_subrequest', 'ping', 'speculative'],


	ajaxTypes: ['xmlhttprequest'],


	compressedExts: [
		'zip', 'gzip', 'gz', 'bz', 'bz2', '7z', 'tar', 'tgz', 'rar', 'jar', 'xpi', 'apk',
	],
	compressedMimes: [
		'application/x-compressed', 'application/x-zip-compressed', 'application/zip', 
		'application/x-gzip', 'application/x-bzip', 'application/x-bzip2', 'application/x-7z',
		'application/x-tar', 'application/gnutar', 	'application/x-rar-compressed',
	],


	mediaExts: [
		//audio 
		'wav', 'wave', 'aiff', 'flac', 'alac', 'wma', 'mp3', 'ogg', 'aac', 'wma', 'weba',
		//video 
		'avi', 'flv', 'swf', 'wmv', 'mov', 'qt', 'ts', 'mp4', 'm4p', 'm4v', 'mkv', 'mpg', 'mpeg',
		'mp2', 'mpv', 'mpe', 'avchd', 'webm',
	],
	mediaMimes: [
		//audio
		'audio/wav', 'audio/aiff', 'audio/x-aiff', 'audio/flac', 'audio/mpeg', 'audio/mpeg3', 
		'audio/x-mpeg-3', 'audio/mp3', 'audio/ogg', 'audio/aac', 'audio/x-aac', 'audio/webm',
		//video
		'application/x-troff-msvideo', 'video/avi', 'video/msvideo', 'video/x-msvideo', 
		'application/x-shockwave-flash', 'video/quicktime', 'video/mp2t', 'video/mpeg', 
		'video/mp4', 'video/webm',
	],
	mediaTypes : [
		'media'
	],


	documentExts : [
		//documents
		'doc', 'xls', 'ppt', 'docx', 'xlsx', 'pptx', 'pdf', 'epub', 'mobi', 'djvu', 'cbr',
	],
	documentMimes: [
		'application/msword', 'application/mspowerpoint', 'application/powerpoint', 
		'application/x-mspowerpoint','application/excel', 'application/x-excel', 'application/pdf',
	],


	binaryExts: [
		//platform-specific
		'exe', 'msi', 'deb', 'rpm', 'pkg', 'dmg', 'app', 
		//other
		'bin', 'iso',
	],
	generalBinaryMimes : [
		//other
		'application/octet-stream', 'application/binary',
	],


	disPlayableExts: [
		'wav', 'wave', 'ogg', 'oga', 'ogv', 'ogx', 'spx', 'opus', 'webm', 'flac', 'mp3', 
		'mp4', 'm4a', 'm4p', 'm4b', 'm4r', 'm4v', 'txt', 'pdf'
	],
	disPlayableMimes: [
		'audio/wav', 'audio/ogg', 'video/ogg', 'audio/webm', 'video/webm', 'audio/flac', 
		'audio/mpeg', 'audio/mpeg3', 'audio/x-mpeg-3', 'audio/mp3', 'video/mp4', 
		'text/plain', 'application/pdf'
	],

	mimesToExts : {
		"audio/aac" : "aac",
		"audio/x-aac" : "aac",
		"application/x-abiword" : "abw",
		"application/x-freearc" : "arc",
		"video/x-msvideo" : "avi",
		"application/vnd.amazon.ebook" : "azw",
		"application/octet-stream" : "bin",
		"image/bmp" : "bmp",
		"application/x-bzip" : "bz",
		"application/x-bzip2" : "bz2",
		"application/x-csh" : "csh",
		"text/css" : "css",
		"text/csv" : "csv",
		"application/msword" : "doc",
		"application/mspowerpoint" : "pptx",
		"application/powerpoint" : "pptx",
		"application/x-mspowerpoint" : "pptx",
		"application/excel" : "xlsx",
		"application/x-excel" : "xlsx",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "xlsx",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "docx",
		"application/vnd.ms-fontobject" : "eot",
		"application/epub+zip" : "epub",
		"application/gzip" : "gz",
		"application/x-gzip" : "gz",
		"image/gif" : "gif",
		"text/html" : "html",
		"image/vnd.microsoft.icon" : "ico",
		"text/calendar" : "ics",
		"application/java-archive" : "jar",
		"image/jpeg" : "jpg",
		"text/javascript" : "js",
		"application/javascript" : "js",
		"application/json" : "json",
		"application/ld+json" : "jsonld",
		"audio/midi audio/x-midi" : "midi",
		"text/javascript" : "mjs",
		"audio/mpeg" : "mp3",
		"audio/mpeg3" : "mp3",
		"audio/x-mpeg-3" : "mp3",
		"audio/mp3" : "mp3",
		"video/mpeg" : "mpeg",
		"video/mp4" : "mp4",
		"application/vnd.apple.installer+xml" : "mpkg",
		"application/vnd.oasis.opendocument.presentation" : "odp",
		"application/vnd.oasis.opendocument.spreadsheet" : "ods",
		"application/vnd.oasis.opendocument.text" : "odt",
		"audio/ogg" : "oga",
		"video/ogg" : "ogv",
		"application/ogg" : "ogx",
		"audio/opus" : "opus",
		"font/otf" : "otf",
		"image/png" : "png",
		"application/pdf" : "pdf",
		"application/php" : "php",
		"application/vnd.ms-powerpoint" : "ppt",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation" : "pptx",
		"application/vnd.rar" : "rar",
		"application/x-rar-compressed" : "rar",
		"application/rtf" : "rtf",
		"application/x-sh" : "sh",
		"image/svg+xml" : "svg",
		"application/x-shockwave-flash" : "swf",
		"video/quicktime" : "mov",
		"video/mp2t" : "ts",
		"application/x-tar" : "tar",
		"application/gnutar" : "tar",
		"image/tiff" : "tiff",
		"font/ttf" : "ttf",
		"text/plain" : "txt",
		"application/vnd.visio" : "vsd",
		"audio/wav" : "wav",
		"audio/aiff" : "aiff",
		"audio/x-aiff" : "aiff",
		"audio/webm" : "weba",
		"video/webm" : "webm",
		"application/x-troff-msvideo" : "avi",
		"video/avi" : "avi",
		"video/msvideo" : "avi",
		"image/webp" : "webp",
		"font/woff" : "woff",
		"font/woff2" : "woff2",
		"application/xhtml+xml" : "xhtml",
		"application/vnd.ms-excel" : "xls",
		"application/xml" : "xml",
		"text/xml" : "xml",
		"application/vnd.mozilla.xul+xml" : "xul",
		"application/zip" : "zip",
		"application/x-compressed" : "zip",
		"application/x-zip-compressed" : "zip",
		"video/3gpp" : "3gp",
		"audio/3gpp" : "3gp",
		"video/3gpp2" : "3g2",
		"audio/3gpp2" : "3g2",
		"application/x-7z" : "7z",
		"application/x-7z-compressed" : "7z"
	},

	extsToMimes: {
		"aac" : ["audio/aac", "audio/x-aac"],
		"abw" : ["application/x-abiword"],
		"arc" : ["application/x-freearc"],
		"avi" : ["video/x-msvideo"],
		"azw" : ["application/vnd.amazon.ebook"],
		"bin" : ["application/octet-stream"],
		"bmp" : ["image/bmp"],
		"bz" : ["application/x-bzip"],
		"bz2" : ["application/x-bzip2"],
		"csh" : ["application/x-csh"],
		"css" : ["text/css"],
		"csv" : ["text/csv"],
		"doc" : ["application/msword"],
		"pptx" : ["application/mspowerpoint", "application/powerpoint", "application/x-mspowerpoint"],
		"xlsx" : ["application/excel", "application/x-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
		"docx" : ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
		"eot" : ["application/vnd.ms-fontobject"],
		"epub" : ["application/epub+zip"],
		"gz" : ["application/gzip", "application/x-gzip"],
		"gif" : ["image/gif"],
		"html" : ["text/html"],
		"ico" : ["image/vnd.microsoft.icon"],
		"ics" : ["text/calendar"],
		"jar" : ["application/java-archive"],
		"jpg" : ["image/jpeg"],
		"js" : ["text/javascript", "application/javascript"],
		"json" : ["application/json"],
		"jsonld" : ["application/ld+json"],
		"midi" : ["audio/midi audio/x-midi"],
		"mjs" : ["text/javascript"],
		"mp3" : ["audio/mpeg", "audio/mpeg3", "audio/x-mpeg-3", "audio/mp3"],
		"mpeg" : ["video/mpeg"],
		"mp4" : ["video/mp4"],
		"mpkg" : ["application/vnd.apple.installer+xml"],
		"odp" : ["application/vnd.oasis.opendocument.presentation"],
		"ods" : ["application/vnd.oasis.opendocument.spreadsheet"],
		"odt" : ["application/vnd.oasis.opendocument.text"],
		"oga" : ["audio/ogg"],
		"ogv" : ["video/ogg"],
		"ogx" : ["application/ogg"],
		"opus" : ["audio/opus"],
		"otf" : ["font/otf"],
		"png" : ["image/png"],
		"pdf" : ["application/pdf"],
		"php" : ["application/php"],
		"ppt" : ["application/vnd.ms-powerpoint"],
		"pptx" : ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
		"rar" : ["application/vnd.rar", "application/x-rar-compressed"],
		"rtf" : ["application/rtf"],
		"sh" : ["application/x-sh"],
		"svg" : ["image/svg+xml"],
		"swf" : ["application/x-shockwave-flash"],
		"mov" : ["video/quicktime"],
		"ts" : ["video/mp2t"],
		"tar" : ["application/x-tar", "application/gnutar"],
		"tiff" : ["image/tiff"],
		"ttf" : ["font/ttf"],
		"txt" : ["text/plain"],
		"vsd" : ["application/vnd.visio"],
		"wav" : ["audio/wav"],
		"aiff" : ["audio/aiff",  "audio/x-aiff"],
		"weba" : ["audio/webm"],
		"webm" : ["video/webm"],
		"avi" : ["application/x-troff-msvideo", "video/avi", "video/msvideo"],
		"webp" : ["image/webp"],
		"woff" : ["font/woff"],
		"woff2" : ["font/woff2"],
		"xhtml" : ["application/xhtml+xml"],
		"xls" : ["application/vnd.ms-excel"],
		"xml" : ["application/xml", "text/xml"],
		"xul" : ["application/vnd.mozilla.xul+xml"],
		"zip" : ["application/zip", "application/x-compressed", "application/x-zip-compressed"],
		"3gp" : ["video/3gpp", "audio/3gpp"],
		"3g2" : ["video/3gpp2", "audio/3gpp2"],
		"7z" : ["application/x-7z", "application/x-7z-compressed"]
	}

}

class DownloadInfo{
	constructor(url, desc, cookies, postData, filename, extension){
		this.url = url || '';
		this.desc = desc || '';
		this.cookies = cookies || '';
		this.postData = postData || '';
		this.filename = filename || '';
		this.extension = extension || '';
	}
}

class DownloadJob{
	
	/**
	 * 
	 * @param {DownloadInfo[]} downloadsInfo 
	 * @param {string} referer 
	 * @param {string} originPageReferer 
	 * @param {string} originPageCookies 
	 * @param {string} dmName 
	 */
	constructor(downloadsInfo, referer, originPageReferer, originPageCookies, dmName){
		this.downloadsInfo = downloadsInfo || '';
		this.referer = referer || '';
		this.originPageReferer = originPageReferer || '';
		this.originPageCookies = originPageCookies || '';
		this.useragent = navigator.userAgent;
		this.dmName = dmName || '';
	}

	/**
	 * 
	 * @param {string} dmName 
	 * @param {Download} download 
	 */
	static async getFromDownload(dmName, download){

		let originPageCookies = await NativeMessaging.getCookies(download.url);
		let originPageReferer = '';
		let originTabId = -1;

		let tabs = await browser.tabs.query({url: download.origin});
		//todo: store originpage referer and originpage cookies in download object
		//todo: in popup context clone the download object properly so we won't have to add code for 
		//every single property 
		//if we have closed that tab(specially the case when downoading from side bar later)
		if(tabs[0]){
			originTabId = tabs[0].id;
			originPageReferer = await browser.tabs.executeScript(
				originTabId, {code: 'document.referrer'}
			);
		}

		let downloadInfo = new DownloadInfo(
			download.url, 
			download.getFilename(),
			download.getHeader('cookie', 'request') || '',
			download.reqDetails.postData,
			download.getFilename(),
			download.getFileExtension()
		);

		return new DownloadJob(
			[downloadInfo],
			download.getHeader('referer', 'request') || '',
			originPageReferer || '',
			originPageCookies || '',
			dmName
		);

	}

	static async getFromLinks(dmName, links, originPageUrl, originPageReferer){

		let downloadsInfo = [];
		let originPageCookies = (originPageUrl)? await NativeMessaging.getCookies(originPageUrl) : '';
		//get the cookies for each link and add it to all download items
		for(let link of links){
			if(!link.href){
				continue
			}
			let href = link.href;
			let description = link.description || '';
			let linkCookies = await NativeMessaging.getCookies(href) || '';
			let filename = Utils.getFileName(href);
			let extension = Utils.getExtFromFileName(filename);
			let downloadInfo = new DownloadInfo(href, description, linkCookies, '', filename, extension);
			downloadsInfo.push(downloadInfo);
		}

		return new DownloadJob(downloadsInfo, originPageUrl, originPageReferer, originPageCookies, dmName);

	}

}
