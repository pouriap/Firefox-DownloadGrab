'use strict';

describe("Downloads with mp4 and bin files excluded", function () {

	var options = {
		"overrideDlDialog": true,
		"playMediaInBrowser": true,
		"dlListSize": "20",
		"grabFilesLargerThanMB": "0",
		"excludeWebFiles": true,
		"excludedExts": "mp4,bin",
		"includedExts": "",
		"forcedExts": "",
		"blacklistDomains": "",
		"defaultDM": ""
	}

	initApp(options);
	

	describe("direct bin file", function () {
		let dlInfo = REQ.direct_bin;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

	describe("direct unknown file type", function () {
		let dlInfo = REQ.direct_asdf;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);		
		});
	});

	describe("direct script", function () {
		let dlInfo = REQ.direct_js;
		let action = req(dlInfo);
		it("is ignored", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

	describe("direct image", function () {
		let dlInfo = REQ.direct_jpg;
		let action = req(dlInfo);
		it("is ignored", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

	describe("direct text", function () {
		let dlInfo = REQ.direct_txt;
		let action = req(dlInfo);
		it("is silent grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB_SILENT);
		});
	});

	describe("direct pdf", function () {
		let dlInfo = REQ.direct_pdf;
		let action = req(dlInfo);
		it("is silent grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB_SILENT);
		});
	});

	describe("direct mp4", function () {
		let dlInfo = REQ.direct_mp4;
		let action = req(dlInfo);
		it("is silent grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

	describe("direct mp4 no file name", function () {
		let dlInfo = REQ.direct_mp4_nofilename;
		let action = req(dlInfo);
		it("is silent grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

	describe("direct audio", function () {
		let dlInfo = REQ.direct_mp3;
		let action = req(dlInfo);
		it("is silent grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB_SILENT);
		});
	});

	describe("attachment bin file", function () {
		let dlInfo = REQ.attch_bin;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);		
		});
	});

	describe("attachment unknown file type", function () {
		let dlInfo = REQ.attch_asdf;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);
		});
	});

	describe("attachment script", function () {
		let dlInfo = REQ.attch_js;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);
		});
	});

	describe("attachment image", function () {
		let dlInfo = REQ.attch_jpg;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);
		});
	});

	describe("attachment text", function () {
		let dlInfo = REQ.attch_txt;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);
		});
	});

	describe("attachment pdf", function () {
		let dlInfo = REQ.attch_pdf;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);
		});
	});

	describe("attachment mp4", function () {
		let dlInfo = REQ.attch_mp4;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

	describe("attachment audio", function () {
		let dlInfo = REQ.attch_mp3;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_GRAB);
		});
	});

	describe("inline video", function () {
		let dlInfo = REQ.inline_mp4;
		let action = req(dlInfo);
		it("is grabbed", function () {
			expect(action).toEqual(ReqFilter.ACT_IGNORE);
		});
	});

});