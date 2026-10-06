(function graphGenerator(thisObj) {

    // Polyfill indexOf for older AE ExtendScript engines
    if (!Array.prototype.indexOf) {
        Array.prototype.indexOf = function(elt /*, from*/) {
            var len = this.length >>> 0;
            var from = Number(arguments[1]) || 0;
            from = (from < 0) ? Math.ceil(from) : Math.floor(from);
            if (from < 0) from += len;
            for (; from < len; from++) {
                if (from in this && this[from] === elt) return from;
            }
            return -1;
        };
    }

    var CONFIG = {
        margin: 150,
        lineWidth: 4,
        fontSize: 25,
        fontFamily: "Helvetica",
        axisColor: [0, 0, 0],
        gridColor: null,
        
        // Palette 1: Brand Scale (Multi-step scale)
        brandMultiScales: {
            2: ["#ca0080", "#E295C5"],
            3: ["#ca0080", "#E295C5", "#D4C5E2"],
            4: ["#ca0080", "#E295C5", "#D4C5E2", "#8EBAE5"],
            5: ["#ca0080", "#E295C5", "#D4C5E2", "#8EBAE5", "#FFC000"],
            6: ["#ca0080", "#E295C5", "#D4C5E2", "#8EBAE5", "#B3D1E8", "#FFC000"],
            7: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#FFC000"],
            8: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#0099A8", "#FFC000"],
            9: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#0099A8", "#40C7C7", "#FFC000"],
            10: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#0099A8", "#40C7C7", "#A3E0E0", "#FFC000"]
        },

        // Palette 2: Corporate Scale
        corporateScales: {
            2: ["#06007F", "#C80102"],
            3: ["#06007F", "#DADADA", "#C80102"],
            4: ["#06007F", "#DADADA", "#5E5E5E", "#C80102"],
            5: ["#06007F", "#F8ECF7", "#DADADA", "#5E5E5E", "#C80102"],
            6: ["#06007F", "#F8ECF7", "#DADADA", "#8EBAE5", "#5E5E5E", "#C80102"],
            7: ["#06007F", "#F8ECF7", "#D4C5E2", "#DADADA", "#8EBAE5", "#5E5E5E", "#C80102"],
            8: ["#06007F", "#F8ECF7", "#D4C5E2", "#DADADA", "#8EBAE5", "#0099A8", "#5E5E5E", "#C80102"]
        },

        defaultFillPalette: [
            [0.761, 0.000, 0.471],
            [0.886, 0.584, 0.773],
            [0.831, 0.773, 0.886],
            [0.000, 0.447, 0.698],
            [0.557, 0.730, 0.898],
            [0.702, 0.820, 0.910],
            [0.000, 0.600, 0.659],
            [0.251, 0.780, 0.780],
            [0.639, 0.878, 0.878],
            [1.000, 0.753, 0.000]
        ],
        defaultStrokePalette: [
            [0.761, 0.000, 0.471],
            [0.886, 0.584, 0.773],
            [0.831, 0.773, 0.886],
            [0.000, 0.447, 0.698],
            [0.557, 0.730, 0.898],
            [0.702, 0.820, 0.910],
            [0.000, 0.600, 0.659],
            [0.251, 0.780, 0.780],
            [0.639, 0.878, 0.878],
            [1.000, 0.753, 0.000]
        ],
        
        activeSeriesColors: {}
    };

    var customPastedPalette = null;
    var currentWideColumns = [];
    var currentLongSeriesOrder = [];

    function resolveScaleColors(presetName, count) {
        if (customPastedPalette && customPastedPalette.length > 0 && presetName === "Custom / Pasted") {
            var res = [];
            for (var i = 0; i < count; i++) {
                res.push(customPastedPalette[i % customPastedPalette.length]);
            }
            return res;
        }

        var scheme = (presetName && presetName.indexOf("2") !== -1) ? CONFIG.corporateScales : CONFIG.brandMultiScales;

        if (scheme[count]) {
            var exactList = [];
            for (var e = 0; e < scheme[count].length; e++) {
                exactList.push(hexToAeColor(scheme[count][e]));
            }
            return exactList;
        }

        var availableCounts = [];
        for (var k in scheme) {
            var parsed = parseInt(k, 10);
            if (!isNaN(parsed)) availableCounts.push(parsed);
        }
        availableCounts.sort(function(a, b) { return a - b; });

        var bestKey = availableCounts[availableCounts.length - 1];
        for (var c = 0; c < availableCounts.length; c++) {
            if (availableCounts[c] >= count) {
                bestKey = availableCounts[c];
                break;
            }
        }

        var baseHexList = scheme[bestKey] || [];
        var resultList = [];
        for (var idx = 0; idx < count; idx++) {
            var hexPick = baseHexList[idx % baseHexList.length];
            resultList.push(hexToAeColor(hexPick));
        }
        return resultList;
    }

    function safeProperty(parent, matchName, fallbackIndex, displayName) {
        if (!parent) return null;
        var prop = null;
        try { prop = parent.property(matchName); } catch(e) {}
        if (prop) return prop;
        if (displayName) {
            try { prop = parent.property(displayName); } catch(e) {}
            if (prop) return prop;
        }
        if (typeof fallbackIndex === "number" && fallbackIndex <= parent.numProperties) {
            try { prop = parent.property(fallbackIndex); } catch(e) {}
            if (prop) return prop;
        }
        try {
            for (var i = 1; i <= parent.numProperties; i++) {
                var p = parent.property(i);
                if (p && (p.matchName === matchName || p.name === displayName)) {
                    return p;
                }
            }
        } catch(e) {}
        return null;
    }

    function cleanHex(str) {
        if (!str) return null;
        str = str.replace(/^#/, '');
        if (str.length === 3) {
            str = str.charAt(0) + str.charAt(0) + str.charAt(1) + str.charAt(1) + str.charAt(2) + str.charAt(2);
        }
        if (/^[0-9A-F]{6}$/i.test(str)) {
            return str.toUpperCase();
        }
        return null;
    }

    function hexToAeColor(hexStr) {
        var cleaned = cleanHex(hexStr);
        if (!cleaned) return null;
        var r = parseInt(cleaned.substring(0, 2), 16) / 255;
        var g = parseInt(cleaned.substring(2, 4), 16) / 255;
        var b = parseInt(cleaned.substring(4, 6), 16) / 255;
        return [r, g, b];
    }

    function aeColorToHex(aeColor) {
        var r = Math.round(aeColor[0] * 255).toString(16);
        var g = Math.round(aeColor[1] * 255).toString(16);
        var b = Math.round(aeColor[2] * 255).toString(16);
        if (r.length < 2) r = "0" + r;
        if (g.length < 2) g = "0" + g;
        if (b.length < 2) b = "0" + b;
        return ("#" + r + g + b).toUpperCase();
    }

    function setElementColor(elem, aeColor) {
        try {
            var g = elem.graphics;
            var brush = g.newBrush(g.BrushType.SOLID_COLOR, [aeColor[0], aeColor[1], aeColor[2], 1]);
            g.backgroundColor = brush;
            elem.onDraw = function() {
                try {
                    var g2 = this.graphics;
                    var brush2 = g2.newBrush(g2.BrushType.SOLID_COLOR, [aeColor[0], aeColor[1], aeColor[2], 1]);
                    var w = (this.size && this.size[0] > 0) ? this.size[0] : 18;
                    var h = (this.size && this.size[1] > 0) ? this.size[1] : 18;
                    g2.rectPath(0, 0, w, h);
                    g2.fillPath(brush2);
                } catch(e) {}
            };
        } catch(e) {}
    }

    function getNiceStep(range, targetDivisions) {
        var target = targetDivisions || 5;
        var roughStep = range / target;
        if (roughStep <= 0) return 1;
        var exponent = Math.floor(Math.log(roughStep) / Math.LN10);
        var fraction = roughStep / Math.pow(10, exponent);
        var niceFraction;
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
        return niceFraction * Math.pow(10, exponent);
    }

    function formatNumber(value, decimals, thousandSep, decSep) {
        var numVal = parseFloat(value);
        if (isNaN(numVal)) return value.toString();
        var dSep = (decSep !== undefined && decSep !== null && decSep !== "") ? decSep : ".";
        var tSep = (thousandSep !== undefined && thousandSep !== null) ? thousandSep : ",";
        var numStr = (decimals !== undefined && decimals !== null && decimals >= 0) 
            ? numVal.toFixed(decimals) 
            : numVal.toString();
        var parts = numStr.split(".");
        var intPart = parts[0];
        var decPart = parts.length > 1 ? dSep + parts[1] : "";
        var formattedInt = "";
        var len = intPart.length;
        for (var i = 0; i < len; i++) {
            if (i > 0 && (len - i) % 3 === 0 && intPart.charAt(i) !== '-') {
                formattedInt += tSep;
            }
            formattedInt += intPart.charAt(i);
        }
        return formattedInt + decPart;
    }

    function num(v){
        if (typeof v === "number") return v;
        if (v === undefined || v === null) return 0;
        if (typeof v === "string") {
            var clean = v.replace(/^\s+|\s+$/g, '');
            if (clean === "-" || clean === "") return 0;
            clean = clean.replace(/\s/g, '');
            if (clean.indexOf(',') !== -1 && clean.indexOf('.') !== -1) {
                if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
                    clean = clean.replace(/\./g, '').replace(',', '.');
                } else {
                    clean = clean.replace(/,/g, '');
                }
            } else if (clean.indexOf(',') !== -1) {
                clean = clean.replace(',', '.');
            }
            var n = parseFloat(clean);
            return isNaN(n) ? 0 : n;
        }
        var n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }

    function isNumeric(val) {
        if (typeof val === "number") return true;
        if (typeof val !== "string") return false;
        var clean = val.replace(/^\s+|\s+$/g, '');
        if (clean === "-") return true;
        clean = clean.replace(',', '.');
        return !isNaN(clean) && !isNaN(parseFloat(clean));
    }

    function safeDD(dd){
        return dd && dd.selection ? dd.selection.text : null;
    }

    function splitLine(line, delimiter) {
        if (!line) return [];
        var escapedDelim = delimiter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        var regex = new RegExp(escapedDelim, "g");
        var processedLine = line.replace(regex, delimiter + "###EMPTY###");
        if (processedLine.indexOf("###EMPTY###") === 0) {
            processedLine = "###EMPTY###" + processedLine;
        }
        if (line.slice(-delimiter.length) === delimiter) {
            processedLine += "###EMPTY###";
        }
        var parts = processedLine.split(delimiter);
        for (var i = 0; i < parts.length; i++) {
            parts[i] = parts[i].replace("###EMPTY###", "").replace(/^\s+|\s+$/g, '');
        }
        return parts;
    }

    function getSanitizedLines(rawText, skipCount) {
        if (!rawText) return [];
        var lines = rawText.split(/\r?\n/);
        var clean = [];
        for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].replace(/^\s+|\s+$/g, '');
            if (trimmed !== "") {
                clean.push(lines[i]);
            }
        }
        if (skipCount && skipCount > 0 && skipCount < clean.length) {
            clean = clean.slice(skipCount);
        }
        return clean;
    }

    function parseHeaders(firstLine, delimiter){
        if (!firstLine) return [];
        var headers = splitLine(firstLine, delimiter);
        for (var i = 0; i < headers.length; i++) {
            if (!headers[i] || headers[i].replace(/^\s+|\s+$/g, '') === "") {
                headers[i] = "[Column " + (i + 1) + "]";
            }
        }
        return headers;
    }

    function fill(dd, items){
        if (dd.removeAll) {
            dd.removeAll();
        } else {
            while (dd.items.length > 0) {
                dd.remove(0);
            }
        }
        for (var i = 0; i < items.length; i++) {
            dd.add("item", items[i]);
        }
        if (dd.items.length > 0) {
            dd.selection = 0;
        }
    }

    function makeShapeLayer(comp, name){
        var l = comp.layers.addShape();
        l.name = name;
        var trans = safeProperty(l, "ADBE Transform Group", 3, "Transform");
        if (trans) {
            var ap = safeProperty(trans, "ADBE Anchor Point", 1, "Anchor Point");
            if (ap) ap.setValue([0, 0]);
            var pos = safeProperty(trans, "ADBE Position", 2, "Position");
            if (pos) pos.setValue([0, 0]);
        }
        return l;
    }

    function createText(comp, textStr, pos, justify, name, customFontSize) {
        var textLayer = comp.layers.addText(textStr);
        textLayer.name = name || "Label_" + textStr;
        var textPropGroup = safeProperty(textLayer, "ADBE Text Properties", 1, "Text");
        if (!textPropGroup) return textLayer;
        var sourceText = safeProperty(textPropGroup, "ADBE Text Document", 1, "Source Text");
        if (!sourceText) return textLayer;
        var textDoc = sourceText.value;
        try {
            textDoc.font = CONFIG.fontFamily;
        } catch (errFont1) {
            try { textDoc.font = "Helvetica"; } catch (errFont2) {
                try { textDoc.font = "ArialMT"; } catch (errFont3) {}
            }
        }
        textDoc.fontSize = customFontSize || CONFIG.fontSize;
        textDoc.fillColor = CONFIG.axisColor;
        textDoc.applyFill = true;
        if (justify === "left") textDoc.justification = ParagraphJustification.LEFT_JUSTIFY;
        else if (justify === "right") textDoc.justification = ParagraphJustification.RIGHT_JUSTIFY;
        else textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
        
        sourceText.setValue(textDoc);
        var trans = safeProperty(textLayer, "ADBE Transform Group", 3, "Transform");
        if (trans) {
            var positionProp = safeProperty(trans, "ADBE Position", 2, "Position");
            if (positionProp) positionProp.setValue(pos);
        }
        return textLayer;
    }

    function buildUI(thisObj){
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "AE Graph Generator Pro", undefined, {resizeable: true});

        win.onResizing = win.onResize = function() {
            this.layout.resize();
            updateTabScrollbar();
        };

        win.orientation = "column";
        win.alignChildren = ["fill", "fill"];
        win.spacing = 8;
        win.margins = 12;

        var tabGroup = win.add("tabbedpanel", undefined, undefined);
        tabGroup.alignment = ["fill", "fill"];

        // TAB 1: DATA INPUT
        var tabData = tabGroup.add("tab", undefined, "1. Data Input");
        tabData.orientation = "column";
        tabData.alignChildren = ["fill", "fill"];
        tabData.margins = 10;

        var tabDataScroll = tabData.add("group");
        tabDataScroll.orientation = "column";
        tabDataScroll.alignChildren = ["fill", "top"];
        tabDataScroll.spacing = 8;

        var csvGrp = tabDataScroll.add("panel", undefined, "Paste Spreadsheet Data");
        csvGrp.orientation = "column";
        csvGrp.alignChildren = ["fill", "top"];
        csvGrp.spacing = 6;
        csvGrp.margins = 10;

        var pasteHeaderRow = csvGrp.add("group");
        pasteHeaderRow.orientation = "row";
        pasteHeaderRow.alignChildren = ["fill", "center"];
        
        var pasteInstruction = pasteHeaderRow.add("statictext", undefined, "Paste table cells below (from Excel, Sheets, web):");
        pasteInstruction.alignment = ["fill", "center"];

        var browseBtn = pasteHeaderRow.add("button", undefined, "📁 Import File...");
        browseBtn.preferredSize = [100, 22];
        browseBtn.helpTip = "Import a CSV, TSV, or TXT spreadsheet file";

        var csvInput = csvGrp.add("edittext", undefined, "", {multiline: true, scrolling: true});
        csvInput.preferredSize = [-1, 150];

        var configRow = csvGrp.add("group");
        configRow.orientation = "row";
        configRow.alignChildren = ["left", "center"];
        configRow.spacing = 8;
        
        configRow.add("statictext", undefined, "Delimiter:");
        var delimInput = configRow.add("edittext", undefined, "auto"); 
        delimInput.preferredSize = [40, 20];

        configRow.add("statictext", undefined, "Skip Rows:");
        var skipHeaderIn = configRow.add("edittext", undefined, "0");
        skipHeaderIn.preferredSize = [30, 20];

        var inspectPanel = csvGrp.add("panel", undefined, "Data Preview");
        inspectPanel.orientation = "column";
        inspectPanel.alignChildren = ["fill", "top"];
        inspectPanel.spacing = 2;
        inspectPanel.margins = 6;

        var headerDetectTxt = inspectPanel.add("statictext", undefined, "Header (Row 1): [ No Data ]");
        var sampleDetectTxt = inspectPanel.add("statictext", undefined, "Sample (Row 2): [ No Data ]");
        var rowsDetectTxt = inspectPanel.add("statictext", undefined, "Rows Count: 0");

        var loadBtn = tabDataScroll.add("button", undefined, "Load Data ➔");
        loadBtn.preferredSize = [-1, 32];

        // TAB 2: MAPPING & COLORS
        var tabMapColors = tabGroup.add("tab", undefined, "2. Mapping & Colors");
        tabMapColors.orientation = "row";
        tabMapColors.alignChildren = ["fill", "fill"];
        tabMapColors.margins = [10, 10, 4, 10];
        tabMapColors.spacing = 4;

        var tabMapViewport = tabMapColors.add("group");
        tabMapViewport.orientation = "column";
        tabMapViewport.alignment = ["fill", "fill"];
        tabMapViewport.alignChildren = ["fill", "top"];

        var tabMapScroll = tabMapViewport.add("group");
        tabMapScroll.orientation = "column";
        tabMapScroll.alignment = ["fill", "top"];
        tabMapScroll.alignChildren = ["fill", "top"];
        tabMapScroll.spacing = 8;

        var tabMapScrollBar = tabMapColors.add("scrollbar", undefined, 0, 0, 100);
        tabMapScrollBar.alignment = ["right", "fill"];
        tabMapScrollBar.preferredSize = [14, -1];
        tabMapScrollBar.visible = false;

        tabMapScrollBar.onChanging = tabMapScrollBar.onChange = function() {
            tabMapScroll.location = [0, -Math.round(this.value)];
        };

        var mapPanel = tabMapScroll.add("panel", undefined, "Axis Setup");
        mapPanel.orientation = "column";
        mapPanel.alignChildren = ["fill", "top"];
        mapPanel.spacing = 6;
        mapPanel.margins = 10;

        var formatRow = mapPanel.add("group");
        formatRow.orientation = "row";
        formatRow.alignChildren = ["left", "center"];
        formatRow.spacing = 8;
        formatRow.add("statictext", undefined, "Format:").preferredSize = [80, 20];
        var formatDD = formatRow.add("dropdownlist", undefined, ["Wide (Columns)", "Long (Rows)"]);
        formatDD.selection = 0;
        formatDD.preferredSize = [125, 20];

        var transposeBtn = formatRow.add("button", undefined, "⇄ Flip Rows/Cols");
        transposeBtn.preferredSize = [115, 20];
        transposeBtn.helpTip = "Flip rows and columns of your table";

        var xRowGrp = mapPanel.add("group");
        xRowGrp.orientation = "row";
        xRowGrp.alignChildren = ["left", "center"];
        xRowGrp.spacing = 6;
        var xLabel = xRowGrp.add("statictext", undefined, "X-Axis:");
        xLabel.preferredSize = [80, 20];
        var xDD = xRowGrp.add("dropdownlist", undefined);
        xDD.preferredSize = [125, 20];

        var preserveXOrderChk = xRowGrp.add("checkbox", undefined, "Keep Data Order");
        preserveXOrderChk.value = false;
        preserveXOrderChk.helpTip = "Forces X values to remain in exact CSV order without numerical or chronological sorting";

        var groupRowGrp = mapPanel.add("group");
        groupRowGrp.orientation = "row";
        groupRowGrp.alignChildren = ["left", "center"];
        var groupLabel = groupRowGrp.add("statictext", undefined, "Group:");
        groupLabel.preferredSize = [80, 20];
        var groupDD = groupRowGrp.add("dropdownlist", undefined);
        groupDD.preferredSize = [120,25];
        groupDD.alignment = ["left", "center"];

        var yRowGrp = mapPanel.add("group");
        yRowGrp.orientation = "row";
        yRowGrp.alignChildren = ["left", "center"];
        var yLabel = yRowGrp.add("statictext", undefined, "Y-Axis:");
        yLabel.preferredSize = [80, 20];
        var yDD = yRowGrp.add("dropdownlist", undefined);
        yDD.preferredSize = [120, 25];
        yDD.alignment = ["left", "center"];

        var valueLabelsRowGrp = mapPanel.add("group");
        valueLabelsRowGrp.orientation = "row";
        valueLabelsRowGrp.alignChildren = ["left", "center"];
        var valueLabelSrcLabel = valueLabelsRowGrp.add("statictext", undefined, "Custom Labels:");
        valueLabelSrcLabel.preferredSize = [80, 20];
        var valueLabelDD = valueLabelsRowGrp.add("dropdownlist", undefined);
        valueLabelDD.preferredSize = [120, 25];
        valueLabelDD.alignment = ["left", "center"];

        var wideFormatInfoTxt = mapPanel.add("statictext", undefined, "Wide format: Arrange series order & color palette below.");
        wideFormatInfoTxt.visible = true;

        var sRowGrp = mapPanel.add("group");
        sRowGrp.orientation = "row";
        sRowGrp.alignChildren = ["left", "center"];
        var sLabel = sRowGrp.add("statictext", undefined, "Series:");
        sLabel.preferredSize = [80, 20];
        var sDD = sRowGrp.add("dropdownlist", undefined);
        sDD.preferredSize = [120, 25];
        sDD.alignment = ["left", "center"];

        var typeGrp = mapPanel.add("group");
        typeGrp.orientation = "row";
        typeGrp.alignChildren = ["left", "center"];
        var typeLabel = typeGrp.add("statictext", undefined, "Chart Type:");
        typeLabel.preferredSize = [80, 20];
        var typeDD = typeGrp.add("dropdownlist", undefined, ["Line", "Bar", "Pie"]);
        typeDD.preferredSize = [120, 25]; // Sets width to 120px, height to 25px
        typeDD.selection = 0;
        typeDD.alignment = ["left", "center"];

        var contextualStylesPanel = mapPanel.add("group");
        contextualStylesPanel.orientation = "column";
        contextualStylesPanel.alignChildren = ["fill", "top"];
        contextualStylesPanel.spacing = 6;

        var lineStyleGrp = contextualStylesPanel.add("group");
        lineStyleGrp.orientation = "column";
        lineStyleGrp.alignChildren = ["left", "top"];
        lineStyleGrp.spacing = 4;

        var lineLabelGrp = lineStyleGrp.add("group");
        lineLabelGrp.orientation = "row";
        lineLabelGrp.add("statictext", undefined, "Lines Style:").preferredSize = [70, 20];

        var lineChkRow1 = lineStyleGrp.add("group");
        lineChkRow1.orientation = "row";
        lineChkRow1.spacing = 10;
        var strokeLinesChk = lineChkRow1.add("checkbox", undefined, "Stroke Path"); strokeLinesChk.value = true;
        var dotChk = lineChkRow1.add("checkbox", undefined, "Draw Dots"); dotChk.value = false; 
        var fillLinesChk = lineChkRow1.add("checkbox", undefined, "Area Fill"); fillLinesChk.value = false;

        var lineChkRow2 = lineStyleGrp.add("group");
        lineChkRow2.orientation = "row";
        lineChkRow2.spacing = 10;
        var customFillChk = lineChkRow2.add("checkbox", undefined, "Custom Fill Color"); customFillChk.value = false; customFillChk.visible = false;
        var areaStackChk = lineChkRow2.add("checkbox", undefined, "Stacked Area"); areaStackChk.value = false; areaStackChk.visible = false;
        var fillOpacityLabel = lineChkRow2.add("statictext", undefined, "Opacity %:"); fillOpacityLabel.visible = false;
        var fillOpacityIn = lineChkRow2.add("edittext", undefined, "30"); fillOpacityIn.preferredSize = [35, 20]; fillOpacityIn.visible = false;

        var barStyleGrp = contextualStylesPanel.add("group");
        barStyleGrp.orientation = "column";
        barStyleGrp.alignChildren = ["left", "top"];
        barStyleGrp.spacing = 4;

        var barLabelGrp = barStyleGrp.add("group");
        barLabelGrp.orientation = "row";
        barLabelGrp.add("statictext", undefined, "Bars Style:").preferredSize = [70, 20];

        var barOrientRow = barStyleGrp.add("group");
        barOrientRow.orientation = "row";
        barOrientRow.spacing = 10;
        barOrientRow.add("statictext", undefined, "Orientation:");
        var barOrientationDD = barOrientRow.add("dropdownlist", undefined, ["Vertical", "Horizontal"]);
        barOrientationDD.selection = 0;
        barOrientationDD.preferredSize = [100, 20];

        var barChkRow = barStyleGrp.add("group");
        barChkRow.orientation = "row";
        barChkRow.spacing = 10;
        var fillBarsChk = barChkRow.add("checkbox", undefined, "Fill Layer"); fillBarsChk.value = true;
        var strokeBarsChk = barChkRow.add("checkbox", undefined, "Stroke Outline"); strokeBarsChk.value = false;
        var barStackChk = barChkRow.add("checkbox", undefined, "Stacked Bars"); barStackChk.value = false;

        var layoutGrp = contextualStylesPanel.add("group");
        layoutGrp.orientation = "row";
        layoutGrp.alignChildren = ["left", "center"];
        layoutGrp.spacing = 10;
        
        var bwGrp = layoutGrp.add("group");
        bwGrp.add("statictext", undefined, "Bar Width %:");
        var barWidthInput = bwGrp.add("edittext", undefined, "70"); barWidthInput.preferredSize = [35, 20];

        var bgGrp = layoutGrp.add("group");
        bgGrp.add("statictext", undefined, "Gap %:");
        var barGapInput = bgGrp.add("edittext", undefined, "25"); barGapInput.preferredSize = [35, 20];

        // Pie & Donut Controls
        var pieStyleGrp = contextualStylesPanel.add("group");
        pieStyleGrp.orientation = "column";
        pieStyleGrp.alignChildren = ["left", "top"];
        pieStyleGrp.spacing = 4;
        pieStyleGrp.visible = false;

        var pieLabelGrp = pieStyleGrp.add("group");
        pieLabelGrp.orientation = "row";
        pieLabelGrp.add("statictext", undefined, "Pie Style:").preferredSize = [70, 20];

        var pieToggleRow = pieStyleGrp.add("group");
        pieToggleRow.orientation = "row";
        pieToggleRow.spacing = 10;
        var donutChk = pieToggleRow.add("checkbox", undefined, "Donut Chart"); donutChk.value = true;

        var pieDimRow = pieStyleGrp.add("group");
        pieDimRow.orientation = "row";
        pieDimRow.spacing = 8;
        pieDimRow.add("statictext", undefined, "Max Radius:");
        var maxRadiusIn = pieDimRow.add("edittext", undefined, "220"); maxRadiusIn.preferredSize = [40, 20];
        
        var holeLabel = pieDimRow.add("statictext", undefined, "Hole Size %:");
        var holeSizeIn = pieDimRow.add("edittext", undefined, "50"); holeSizeIn.preferredSize = [35, 20];

        donutChk.onClick = function() {
            holeLabel.visible = donutChk.value;
            holeSizeIn.visible = donutChk.value;
            updateTotalSumVisibility();
        };

        var subLabelChkRow = contextualStylesPanel.add("group");
        subLabelChkRow.orientation = "row";
        subLabelChkRow.alignChildren = ["left", "center"];
        var showSubLabelsChk = subLabelChkRow.add("checkbox", undefined, "Show Group Sub-Labels");
        showSubLabelsChk.value = true;
        showSubLabelsChk.visible = false;

        var colorsPanel = tabMapScroll.add("panel", undefined, "  Series & Colors  ");
        colorsPanel.orientation = "column";
        colorsPanel.alignChildren = ["fill", "top"];
        colorsPanel.spacing = 5;
        colorsPanel.margins = 8;
        colorsPanel.minimumSize = [330, -1];

        var presetSelectRow = colorsPanel.add("group");
        presetSelectRow.orientation = "row";
        presetSelectRow.alignChildren = ["left", "center"];
        presetSelectRow.spacing = 8;
        presetSelectRow.add("statictext", undefined, "Palette:");
        var palettePresetDD = presetSelectRow.add("dropdownlist", undefined, [
            "Palette 1",
            "Palette 2",
            "Custom / Pasted"
        ]);
        palettePresetDD.selection = 0;
        palettePresetDD.preferredSize = [150, 20];

        var quickPasteRow = colorsPanel.add("group");
        quickPasteRow.orientation = "row";
        quickPasteRow.alignChildren = ["left", "center"];
        quickPasteRow.spacing = 6;
        var quickPasteIn = quickPasteRow.add("edittext", undefined, "");
        quickPasteIn.preferredSize = [170, 20];
        quickPasteIn.helpTip = "Paste comma-separated hex codes or Coolors URL";

        var quickPasteBtn = quickPasteRow.add("button", undefined, "Import");
        quickPasteBtn.preferredSize = [60, 20];

        var colHeaders = colorsPanel.add("group");
        colHeaders.orientation = "row";
        colHeaders.alignChildren = ["left", "center"];
        colHeaders.spacing = 4;
        
        var selectAllColsBtn = colHeaders.add("button", undefined, "All");
        selectAllColsBtn.preferredSize = [32, 18];
        selectAllColsBtn.helpTip = "Select all data series";

        var deselectAllColsBtn = colHeaders.add("button", undefined, "None");
        deselectAllColsBtn.preferredSize = [38, 18];
        deselectAllColsBtn.helpTip = "Deselect all data series";

        var headLabelSpacing = colHeaders.add("statictext", undefined, "Order / Name");
        headLabelSpacing.preferredSize = [105, 15];
        
        var fillHeader = colHeaders.add("statictext", undefined, "Fill");
        fillHeader.preferredSize = [82, 15];
        fillHeader.alignment = "center";
        
        var strokeHeader = colHeaders.add("statictext", undefined, "Stroke");
        strokeHeader.preferredSize = [82, 15];
        strokeHeader.alignment = "center";

        var dynamicListGrp = colorsPanel.add("group");
        dynamicListGrp.orientation = "column";
        dynamicListGrp.alignChildren = ["fill", "top"];
        dynamicListGrp.spacing = 3;

        var axisRow = colorsPanel.add("group");
        axisRow.orientation = "column";
        axisRow.alignChildren = ["fill", "center"];
        axisRow.spacing = 4;

        var coreAxisColGroup = axisRow.add("group");
        coreAxisColGroup.orientation = "row";
        coreAxisColGroup.alignChildren = ["left", "center"];
        coreAxisColGroup.spacing = 6;
        coreAxisColGroup.add("statictext", undefined, "Axes & Labels:").preferredSize = [100, 20];

        var axisSwatch = coreAxisColGroup.add("group", undefined);
        axisSwatch.preferredSize = [20, 20];
        setElementColor(axisSwatch, CONFIG.axisColor);

        var axisHexIn = coreAxisColGroup.add("edittext", undefined, aeColorToHex(CONFIG.axisColor));
        axisHexIn.preferredSize = [70, 20];

        axisHexIn.onChange = function() {
            var testColor = hexToAeColor(axisHexIn.text);
            if (testColor !== null) {
                CONFIG.axisColor = testColor;
                setElementColor(axisSwatch, testColor);
                axisHexIn.text = aeColorToHex(testColor);
            } else {
                axisHexIn.text = aeColorToHex(CONFIG.axisColor);
            }
        };

        var gridColGroup = axisRow.add("group");
        gridColGroup.orientation = "row";
        gridColGroup.alignChildren = ["left", "center"];
        gridColGroup.spacing = 6;
        gridColGroup.add("statictext", undefined, "Grid/Ticks Color:").preferredSize = [100, 20];

        var gridSwatch = gridColGroup.add("group", undefined);
        gridSwatch.preferredSize = [20, 20];
        setElementColor(gridSwatch, CONFIG.axisColor); 

        var gridHexIn = gridColGroup.add("edittext", undefined, "");
        gridHexIn.preferredSize = [70, 20];

        gridHexIn.onChange = function() {
            if (gridHexIn.text === "") {
                CONFIG.gridColor = null;
                setElementColor(gridSwatch, CONFIG.axisColor);
                return;
            }
            var testColor = hexToAeColor(gridHexIn.text);
            if (testColor !== null) {
                CONFIG.gridColor = testColor;
                setElementColor(gridSwatch, testColor);
                gridHexIn.text = aeColorToHex(testColor);
            } else {
                gridHexIn.text = CONFIG.gridColor ? aeColorToHex(CONFIG.gridColor) : "";
            }
        };

        var strokeWidthGrp = colorsPanel.add("group");
        strokeWidthGrp.orientation = "row";
        strokeWidthGrp.alignChildren = ["left", "center"];
        strokeWidthGrp.spacing = 10;
        strokeWidthGrp.add("statictext", undefined, "Stroke Width:");
        var strokeWidthIn = strokeWidthGrp.add("edittext", undefined, "4");
        strokeWidthIn.preferredSize = [40, 20];

        var tabOptions = tabGroup.add("tab", undefined, "3. Global Options");
        tabOptions.orientation = "column";
        tabOptions.alignChildren = ["fill", "fill"];
        tabOptions.margins = 10;

        var tabOptionsScroll = tabOptions.add("group", undefined, {scrolling: true});
        tabOptionsScroll.orientation = "column";
        tabOptionsScroll.alignChildren = ["fill", "top"];
        tabOptionsScroll.spacing = 8;

        var opt = tabOptionsScroll.add("panel", undefined, "Display Elements");
        opt.orientation = "column";
        opt.alignChildren = ["fill", "top"];
        opt.spacing = 6;
        opt.margins = 10;

        var globalTogglesPanel = opt.add("group");
        globalTogglesPanel.orientation = "column";
        globalTogglesPanel.alignChildren = ["left", "top"];
        globalTogglesPanel.spacing = 4;

        var togglesRow1 = globalTogglesPanel.add("group"); togglesRow1.orientation = "row"; togglesRow1.spacing = 12;
        var xGridChk = togglesRow1.add("checkbox", undefined, "Show X-Axis Line"); xGridChk.value = true;
        var yGridChk = togglesRow1.add("checkbox", undefined, "Show Y-Axis Line"); yGridChk.value = true;
        var yAxisRightChk = togglesRow1.add("checkbox", undefined, "Y-Axis on Right"); yAxisRightChk.value = false;

        var togglesRow2 = globalTogglesPanel.add("group"); togglesRow2.orientation = "row"; togglesRow2.spacing = 12;
        var xLabelChk = togglesRow2.add("checkbox", undefined, "Show X-Labels"); xLabelChk.value = true;
        var yLabelChk = togglesRow2.add("checkbox", undefined, "Show Y-Labels"); yLabelChk.value = true;
        var valueLabelChk = togglesRow2.add("checkbox", undefined, "Show Value Labels"); valueLabelChk.value = false;

        var labelPosRow = globalTogglesPanel.add("group");
        labelPosRow.orientation = "row";
        labelPosRow.spacing = 8;
        labelPosRow.alignChildren = ["left", "center"];

        // Pie / Donut Text Labels Position
        var pieTextPosGrp = labelPosRow.add("group");
        pieTextPosGrp.orientation = "row";
        pieTextPosGrp.spacing = 6;
        pieTextPosGrp.visible = false;
        pieTextPosGrp.add("statictext", undefined, "Text Labels:");
        var pieTextPosDD = pieTextPosGrp.add("dropdownlist", undefined, ["Outside", "Inside"]);
        pieTextPosDD.selection = 0;
        pieTextPosDD.preferredSize = [75, 20];

        // Shared Value Label Position (Used for Bar, Line, and Pie/Donut)
        var valueLabelPosGrp = labelPosRow.add("group");
        valueLabelPosGrp.orientation = "row";
        valueLabelPosGrp.spacing = 6;
        var valueLabelPosLabel = valueLabelPosGrp.add("statictext", undefined, "Label Position:");
        var valueLabelPosDD = valueLabelPosGrp.add("dropdownlist", undefined, ["Above Bar / Node", "Center of Bar"]);
        valueLabelPosDD.selection = 0;
        valueLabelPosDD.preferredSize = [135, 20];

        var labelOptionsRow = globalTogglesPanel.add("group");
        labelOptionsRow.orientation = "row";
        labelOptionsRow.spacing = 12;
        labelOptionsRow.alignChildren = ["left", "center"];
        var showPctChk = labelOptionsRow.add("checkbox", undefined, "Show %");
        showPctChk.value = true;
        var drawTotalSumChk = labelOptionsRow.add("checkbox", undefined, "Show Stack Totals");
        drawTotalSumChk.value = false;

        var togglesRow3 = globalTogglesPanel.add("group"); togglesRow3.orientation = "row"; togglesRow3.spacing = 12;
        var animateAxesChk = togglesRow3.add("checkbox", undefined, "Animate Axes"); animateAxesChk.value = true;
        var legendChk = togglesRow3.add("checkbox", undefined, "Draw Legend"); legendChk.value = true;

        var animConfigGrp = tabOptionsScroll.add("panel", undefined, "  Animation  ");
        animConfigGrp.orientation = "column";
        animConfigGrp.alignChildren = ["fill", "center"];
        animConfigGrp.spacing = 6;
        animConfigGrp.margins = 8;
        animConfigGrp.minimumSize = [330, -1];

        var animToggleRow = animConfigGrp.add("group"); animToggleRow.orientation = "row"; animToggleRow.spacing = 12;
        var animateGraphChk = animToggleRow.add("checkbox", undefined, "Animate Graph"); animateGraphChk.value = true;
        var syncXLabelsChk = animToggleRow.add("checkbox", undefined, "Sync X-Labels Pace"); syncXLabelsChk.value = false;

        var animDurRow = animConfigGrp.add("group"); animDurRow.orientation = "row"; animDurRow.spacing = 10;
        animDurRow.add("statictext", undefined, "Total Duration (s):"); var totalDurIn = animDurRow.add("edittext", undefined, "2.0"); totalDurIn.preferredSize = [40, 20];
        animDurRow.add("statictext", undefined, "Elem Speed (s):"); var elemDurIn = animDurRow.add("edittext", undefined, "1.0"); elemDurIn.preferredSize = [40, 20];

        var gridConfigGrp = tabOptionsScroll.add("panel", undefined, "  Grid & Ticks  ");
        gridConfigGrp.orientation = "column";
        gridConfigGrp.alignChildren = ["fill", "center"];
        gridConfigGrp.spacing = 6;
        gridConfigGrp.margins = 8;
        gridConfigGrp.minimumSize = [330, -1];

        var xAxisPosRow = gridConfigGrp.add("group"); xAxisPosRow.orientation = "row"; xAxisPosRow.spacing = 10;
        xAxisPosRow.add("statictext", undefined, "Baseline Position:");
        var xAxisPosDD = xAxisPosRow.add("dropdownlist", undefined, ["Zero Baseline (Y=0)", "Bottom of Graph", "Custom Y Level"]); xAxisPosDD.selection = 0; xAxisPosDD.preferredSize = [130, 20];
        var customXAxisLevelInput = xAxisPosRow.add("edittext", undefined, "0"); customXAxisLevelInput.preferredSize = [40, 20]; customXAxisLevelInput.visible = false;

        var ticksFlowGrp = gridConfigGrp.add("group"); ticksFlowGrp.orientation = "column"; ticksFlowGrp.alignChildren = ["left", "top"]; ticksFlowGrp.spacing = 4;
        var xTicksRow = ticksFlowGrp.add("group"); xTicksRow.orientation = "row"; xTicksRow.spacing = 10;
        xTicksRow.add("statictext", undefined, "X-Axis Tick Style:");
        var xTickDD = xTicksRow.add("dropdownlist", undefined, ["None", "Short Ticks", "Full Grid"]); xTickDD.selection = 1; xTickDD.preferredSize = [110, 20];

        var yTicksRow = ticksFlowGrp.add("group"); yTicksRow.orientation = "row"; yTicksRow.spacing = 10;
        yTicksRow.add("statictext", undefined, "Y-Axis Tick Style:");
        var yTickDD = yTicksRow.add("dropdownlist", undefined, ["None", "Short Ticks", "Full Grid"]); yTickDD.selection = 1; yTickDD.preferredSize = [110, 20];

        var yDivsRow = ticksFlowGrp.add("group"); yDivsRow.orientation = "row"; yDivsRow.spacing = 10;
        yDivsRow.add("statictext", undefined, "Y Grid Count:");
        var yDivisionsDD = yDivsRow.add("dropdownlist", undefined, ["Auto (~5)", "2 Steps", "3 Steps", "4 Steps", "5 Steps", "6 Steps", "8 Steps", "10 Steps"]); yDivisionsDD.selection = 0; yDivisionsDD.preferredSize = [110, 20];

        var customYRow = gridConfigGrp.add("group"); customYRow.orientation = "row"; customYRow.spacing = 8;
        var customYRangeChk = customYRow.add("checkbox", undefined, "Custom Y Limits"); customYRangeChk.value = false;
        customYRow.add("statictext", undefined, "Min:"); var minYInput = customYRow.add("edittext", undefined, ""); minYInput.preferredSize = [40, 20]; minYInput.enabled = false;
        customYRow.add("statictext", undefined, "Max:"); var maxYInput = customYRow.add("edittext", undefined, ""); maxYInput.preferredSize = [40, 20]; maxYInput.enabled = false;

        var decimalsRow = gridConfigGrp.add("group"); decimalsRow.orientation = "row"; decimalsRow.spacing = 8;
        decimalsRow.add("statictext", undefined, "Y Decimals:"); var yDecimalsDD = decimalsRow.add("dropdownlist", undefined, ["Auto", "0", "1", "2", "3", "4"]); yDecimalsDD.selection = 0; yDecimalsDD.preferredSize = [55, 20];
        decimalsRow.add("statictext", undefined, "Value Decimals:"); var valDecimalsDD = decimalsRow.add("dropdownlist", undefined, ["Auto", "0", "1", "2", "3", "4"]); valDecimalsDD.selection = 0; valDecimalsDD.preferredSize = [55, 20];

        var sizeRow = gridConfigGrp.add("group"); sizeRow.orientation = "row"; sizeRow.alignChildren = ["left", "center"]; sizeRow.spacing = 10;
        sizeRow.add("statictext", undefined, "Axis Width:"); var axisWidthIn = sizeRow.add("edittext", undefined, "2"); axisWidthIn.preferredSize = [35, 20];
        sizeRow.add("statictext", undefined, "Grid/Tick Width:"); var gridWidthIn = sizeRow.add("edittext", undefined, "1"); gridWidthIn.preferredSize = [35, 20];

        // REFERENCE LINES PANEL
        var refLineGrp = tabOptionsScroll.add("panel", undefined, "  Reference Line  ");
        refLineGrp.orientation = "column";
        refLineGrp.alignChildren = ["fill", "top"];
        refLineGrp.spacing = 6;
        refLineGrp.margins = 8;
        refLineGrp.minimumSize = [330, -1];

        var refLineRow1 = refLineGrp.add("group");
        refLineRow1.orientation = "row";
        refLineRow1.spacing = 10;
        var drawRefLineChk = refLineRow1.add("checkbox", undefined, "Draw Reference Line"); drawRefLineChk.value = false;
        var animateRefLineChk = refLineRow1.add("checkbox", undefined, "Animate Line"); animateRefLineChk.value = true;
        refLineRow1.add("statictext", undefined, "Axis:");
        var refLineAxisDD = refLineRow1.add("dropdownlist", undefined, ["Y-Axis", "X-Axis"]); refLineAxisDD.selection = 0; refLineAxisDD.preferredSize = [80, 20];

        var refLineRow2 = refLineGrp.add("group");
        refLineRow2.orientation = "row";
        refLineRow2.spacing = 8;
        refLineRow2.add("statictext", undefined, "Target Value:");
        var refLineValIn = refLineRow2.add("edittext", undefined, "0"); refLineValIn.preferredSize = [65, 20]; refLineValIn.helpTip = "Numeric value for Y-Axis or date/name string for X-Axis";

        refLineRow2.add("statictext", undefined, "Style:");
        var refLineStyleDD = refLineRow2.add("dropdownlist", undefined, ["Dashed", "Solid", "Dotted"]); refLineStyleDD.selection = 0; refLineStyleDD.preferredSize = [75, 20];

        refLineRow2.add("statictext", undefined, "Width:");
        var refLineWidthIn = refLineRow2.add("edittext", undefined, "2"); refLineWidthIn.preferredSize = [30, 20];

        var refLineRow3 = refLineGrp.add("group");
        refLineRow3.orientation = "row";
        refLineRow3.alignChildren = ["left", "center"];
        refLineRow3.spacing = 8;

        refLineRow3.add("statictext", undefined, "Color:");
        var refLineSwatch = refLineRow3.add("group", undefined);
        refLineSwatch.preferredSize = [18, 18];
        var refLineDefaultColor = [0.5, 0.5, 0.5];
        setElementColor(refLineSwatch, refLineDefaultColor);

        var refLineHexIn = refLineRow3.add("edittext", undefined, "#888888");
        refLineHexIn.preferredSize = [65, 20];
        refLineHexIn.onChange = function() {
            var col = hexToAeColor(refLineHexIn.text);
            if (col) {
                refLineDefaultColor = col;
                setElementColor(refLineSwatch, col);
            }
        };

        refLineRow3.add("statictext", undefined, "Label:");
        var refLineLabelIn = refLineRow3.add("edittext", undefined, "");
        refLineLabelIn.preferredSize = [120, 20];
        refLineLabelIn.helpTip = "Optional text label drawn along the reference line";

        var fontGrp = opt.add("group"); fontGrp.orientation = "row"; fontGrp.alignChildren = ["left", "center"]; fontGrp.spacing = 6;
        var fontLeftGrp = fontGrp.add("group"); fontLeftGrp.orientation = "row"; fontLeftGrp.spacing = 4;
        fontLeftGrp.add("statictext", undefined, "Font:");
        var fontDD = fontLeftGrp.add("dropdownlist", undefined, ["Helvetica", "ArialMT", "Courier", "TimesNewRomanPSMT"]); fontDD.selection = 0; fontDD.preferredSize = [110, 20];
        fontDD.onChange = function() { if (fontDD.selection) CONFIG.fontFamily = fontDD.selection.text; };

        var sepRightGrp = fontGrp.add("group"); sepRightGrp.orientation = "row"; sepRightGrp.spacing = 4;
        sepRightGrp.add("statictext", undefined, "Thousand:"); var thousandsSepInput = sepRightGrp.add("edittext", undefined, ","); thousandsSepInput.preferredSize = [25, 20];
        sepRightGrp.add("statictext", undefined, "Dec:"); var decSepInput = sepRightGrp.add("edittext", undefined, "."); decSepInput.preferredSize = [25, 20];

        var sizeControlGrp = opt.add("group"); sizeControlGrp.orientation = "row"; sizeControlGrp.alignChildren = ["left", "center"]; sizeControlGrp.spacing = 10;
        sizeControlGrp.add("statictext", undefined, "Font Size:"); var fontSizeIn = sizeControlGrp.add("edittext", undefined, "25"); fontSizeIn.preferredSize = [40, 20];

        var legendAlignRow = opt.add("group"); legendAlignRow.orientation = "row"; legendAlignRow.alignChildren = ["left", "center"]; legendAlignRow.spacing = 10;
        legendAlignRow.add("statictext", undefined, "Legend:");
        var legendAlignDD = legendAlignRow.add("dropdownlist", undefined, ["Top Right", "Top Left", "Center Left", "Center Right", "Bottom Right", "Bottom Left"]); legendAlignDD.selection = 0; legendAlignDD.preferredSize = [100, 20];
        legendAlignRow.add("statictext", undefined, "Layout:");
        var legendOrientDD = legendAlignRow.add("dropdownlist", undefined, ["Vertical", "Horizontal"]); legendOrientDD.selection = 0; legendOrientDD.preferredSize = [90, 20];

        var titleGrp = opt.add("group"); titleGrp.orientation = "row"; titleGrp.alignChildren = ["left", "center"]; titleGrp.spacing = 6;
        titleGrp.add("statictext", undefined, "Graph Title:"); var titleInput = titleGrp.add("edittext", undefined, ""); titleInput.preferredSize = [200, 20];

        var statusRow = win.add("group");
        statusRow.orientation = "row";
        statusRow.alignment = ["fill", "bottom"];
        var statusTxt = statusRow.add("statictext", undefined, "");
        statusTxt.alignment = ["fill", "center"];

        var genBtn = win.add("button", undefined, "Generate Graph inside Active Composition");
        genBtn.preferredSize = [-1, 35]; genBtn.alignment = ["fill", "bottom"];

        function resolveDelimiter() {
            var rawText = csvInput.text;
            var val = delimInput.text;
            if (val !== "auto" && val !== "") return val;
            if (rawText.indexOf("\t") !== -1) return "\t";
            if (rawText.indexOf(";") !== -1) return ";";
            return ",";
        }

        function reflowUI() {
            try { 
                win.layout.layout(true); 
                updateTabScrollbar();
            } catch(e) {}
        }

        function updateTabScrollbar() {
            try {
                if (tabGroup.selection !== tabMapColors) {
                    tabMapScrollBar.visible = false;
                    return;
                }
                var viewH = tabMapViewport.size[1];
                var contentH = tabMapScroll.size[1];
                if (contentH > viewH && viewH > 60) {
                    tabMapScrollBar.visible = true;
                    tabMapScrollBar.maxvalue = contentH - viewH;
                    tabMapScrollBar.jumpdelta = Math.max(30, Math.round(viewH * 0.25));
                } else {
                    tabMapScrollBar.visible = false;
                    tabMapScrollBar.maxvalue = 0;
                    tabMapScroll.location = [0, 0];
                }
            } catch(e) {}
        }

        function updateInspectBox() {
            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10);
            if (isNaN(skipCount) || skipCount < 0) skipCount = 0;
            var rawLines = getSanitizedLines(csvInput.text, skipCount);
            if (rawLines.length === 0) {
                headerDetectTxt.text = "Header: [ No Data Detected ]";
                sampleDetectTxt.text = "Sample: [ No Data Detected ]";
                rowsDetectTxt.text = "Rows Count: 0";
                return;
            }
            var headers = parseHeaders(rawLines[0], dChar);
            headerDetectTxt.text = "Header (Row " + (skipCount + 1) + "): [ " + headers.join(", ") + " ]";
            if (rawLines.length > 1) {
                var sampleCells = splitLine(rawLines[1], dChar);
                sampleDetectTxt.text = "Sample (Row " + (skipCount + 2) + "): [ " + sampleCells.join(", ") + " ]";
            } else {
                sampleDetectTxt.text = "Sample: [ Single Row / No Sample ]";
            }
            rowsDetectTxt.text = "Total Active Data Rows: " + (rawLines.length - 1);
        }

        function rebuildColumnChecklist(headers, catCol, subCol) {
            var preserved = [];
            for (var k = 0; k < currentWideColumns.length; k++) {
                var item = currentWideColumns[k];
                if (headers.indexOf(item.name) !== -1 && item.name !== catCol && (!subCol || subCol === "None" || subCol === "(None)" || item.name !== subCol)) {
                    preserved.push(item);
                }
            }
            for (var i = 0; i < headers.length; i++) {
                var hName = headers[i];
                if (hName === catCol || (subCol && subCol !== "None" && subCol !== "(None)" && hName === subCol)) continue;
                var exists = false;
                for (var p = 0; p < preserved.length; p++) {
                    if (preserved[p].name === hName) { exists = true; break; }
                }
                if (!exists) {
                    var lowerH = hName.toLowerCase();
                    var isExcluded = (lowerH.indexOf("total") !== -1 || lowerH.indexOf("totalt") !== -1 || lowerH.indexOf("sum") !== -1);
                    preserved.push({ name: hName, checked: !isExcluded });
                }
            }
            currentWideColumns = preserved;
            updateSeriesColorsUI();
        }

        selectAllColsBtn.onClick = function() {
            var isPie = (typeDD.selection.index === 2);
            var isWide = (formatDD.selection.index === 0 && !isPie);
            var items = isWide ? currentWideColumns : currentLongSeriesOrder;
            for (var i = 0; i < items.length; i++) items[i].checked = true;
            updateSeriesColorsUI();
        };

        deselectAllColsBtn.onClick = function() {
            var isPie = (typeDD.selection.index === 2);
            var isWide = (formatDD.selection.index === 0 && !isPie);
            var items = isWide ? currentWideColumns : currentLongSeriesOrder;
            for (var i = 0; i < items.length; i++) items[i].checked = false;
            updateSeriesColorsUI();
        };

        quickPasteBtn.onClick = function() {
            var txt = quickPasteIn.text;
            if (!txt || txt === "") return;
            var matches = txt.match(/#?([0-9a-fA-F]{6})/g);
            if (matches && matches.length > 0) {
                customPastedPalette = [];
                for (var m = 0; m < matches.length; m++) {
                    var col = hexToAeColor(matches[m]);
                    if (col) customPastedPalette.push(col);
                }
                if (customPastedPalette.length > 0) {
                    palettePresetDD.selection = 2;
                    palettePresetDD.onChange();
                }
            }
        };

        palettePresetDD.onChange = function() {
            var presetName = safeDD(palettePresetDD) || "Palette 1";
            var isPie = (typeDD.selection.index === 2);
            var isWide = (formatDD.selection.index === 0 && !isPie);
            var items = isWide ? currentWideColumns : currentLongSeriesOrder;
            var cap = Math.min(items.length || 5, 14);
            var newColors = resolveScaleColors(presetName, cap);

            for (var i = 0; i < items.length; i++) {
                var sName = items[i].name || items[i];
                var c = newColors[i % newColors.length];
                CONFIG.activeSeriesColors[sName] = { fill: c, stroke: c };
            }
            updateSeriesColorsUI();
        };

        function updateTotalSumVisibility() {
            var isLine = typeDD.selection.index === 0;
            var isPie = typeDD.selection.index === 2;
            var isStacked = isPie ? donutChk.value : (isLine ? (fillLinesChk.value && areaStackChk.value) : barStackChk.value);
            drawTotalSumChk.visible = isStacked;
            reflowUI();
        }

        function updateSeriesColorsUI() {
            while (dynamicListGrp.children.length > 0) {
                dynamicListGrp.remove(dynamicListGrp.children[0]);
            }
            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10);
            if (isNaN(skipCount) || skipCount < 0) skipCount = 0;
            var raw = getSanitizedLines(csvInput.text, skipCount);
            if (raw.length < 2) return;
            var headers = parseHeaders(raw[0], dChar);
            var isWideFormat = formatDD.selection.index === 0;
            var isPie = (typeDD.selection.index === 2);

            selectAllColsBtn.visible = true;
            deselectAllColsBtn.visible = true;

            var itemsToRender = [];

            if (isPie) {
                // For Pie Charts: items represent SLICES, not overall wide columns!
                var pieSliceNames = [];
                var xVal = safeDD(xDD) || headers[0];
                var sVal = safeDD(sDD);
                var xColIdx = headers.indexOf(xVal);
                if (xColIdx === -1) xColIdx = 0;

                if (isWideFormat) {
                    // Slices are derived from the categories listed in X column
                    for (var r = 1; r < raw.length; r++) {
                        var cells = splitLine(raw[r], dChar);
                        var sNameFound = (cells[xColIdx] !== undefined && cells[xColIdx] !== "") 
                            ? cells[xColIdx].replace(/^\s+|\s+$/g, '') 
                            : ("Slice " + r);
                        if (sNameFound !== "" && pieSliceNames.indexOf(sNameFound) === -1) {
                            pieSliceNames.push(sNameFound);
                        }
                    }
                } else {
                    // Long format pie chart: Slices are defined by Series dropdown column
                    var sliceColIdx = sVal ? headers.indexOf(sVal) : -1;
                    if (sliceColIdx !== -1) {
                        for (var lr = 1; lr < raw.length; lr++) {
                            var rCells = splitLine(raw[lr], dChar);
                            if (rCells[sliceColIdx]) {
                                var cleanSlice = rCells[sliceColIdx].replace(/^\s+|\s+$/g, '');
                                if (cleanSlice !== "" && pieSliceNames.indexOf(cleanSlice) === -1) {
                                    pieSliceNames.push(cleanSlice);
                                }
                            }
                        }
                    }
                }

                if (pieSliceNames.length === 0) pieSliceNames.push("Slice 1");

                var preservedPie = [];
                for (var p = 0; p < currentLongSeriesOrder.length; p++) {
                    var existingItem = currentLongSeriesOrder[p];
                    var eName = (typeof existingItem === "string") ? existingItem : existingItem.name;
                    if (pieSliceNames.indexOf(eName) !== -1) {
                        preservedPie.push((typeof existingItem === "string") ? { name: eName, checked: true } : existingItem);
                    }
                }
                for (var np = 0; np < pieSliceNames.length; np++) {
                    var found = false;
                    for (var pe = 0; pe < preservedPie.length; pe++) {
                        if (preservedPie[pe].name === pieSliceNames[np]) { found = true; break; }
                    }
                    if (!found) {
                        preservedPie.push({ name: pieSliceNames[np], checked: true });
                    }
                }
                currentLongSeriesOrder = preservedPie;
                itemsToRender = currentLongSeriesOrder;

            } else if (isWideFormat) {
                if (currentWideColumns.length === 0) {
                    rebuildColumnChecklist(headers, safeDD(xDD), safeDD(groupDD));
                    return;
                }
                itemsToRender = currentWideColumns;
            } else {
                var sValLong = safeDD(sDD);
                var yValLong = safeDD(yDD);
                var discovered = [];
                if (sValLong && sValLong !== "" && headers.indexOf(sValLong) !== -1) {
                    var sIdx = headers.indexOf(sValLong);
                    for (var j = 1; j < raw.length; j++) {
                        var rCell = splitLine(raw[j], dChar);
                        if (rCell[sIdx]) {
                            var cleanVal = rCell[sIdx].replace(/^\s+|\s+$/g, '');
                            if (cleanVal !== "" && discovered.indexOf(cleanVal) === -1) {
                                discovered.push(cleanVal);
                            }
                        }
                    }
                } else if (yValLong && yValLong !== "") {
                    discovered.push(yValLong);
                }
                if (discovered.length === 0) discovered.push("Series 1");

                var preservedLong = [];
                for (var lo = 0; lo < currentLongSeriesOrder.length; lo++) {
                    var itemObj = currentLongSeriesOrder[lo];
                    var itemKey = (typeof itemObj === "string") ? itemObj : itemObj.name;
                    if (discovered.indexOf(itemKey) !== -1) {
                        preservedLong.push((typeof itemObj === "string") ? { name: itemKey, checked: true } : itemObj);
                    }
                }
                for (var d = 0; d < discovered.length; d++) {
                    var exists = false;
                    for (var pl = 0; pl < preservedLong.length; pl++) {
                        if (preservedLong[pl].name === discovered[d]) { exists = true; break; }
                    }
                    if (!exists) {
                        preservedLong.push({ name: discovered[d], checked: true });
                    }
                }
                currentLongSeriesOrder = preservedLong;
                itemsToRender = currentLongSeriesOrder;
            }

            var cap = Math.min(itemsToRender.length, 14);
            var selectedPresetName = safeDD(palettePresetDD) || "Palette 1: Brand Scale";
            var resolvedColors = resolveScaleColors(selectedPresetName, cap);

            var showFillColumn = isPie ? true : ((typeDD.selection.index === 0)
                ? (fillLinesChk.value && (customFillChk.value || !strokeLinesChk.value))
                : fillBarsChk.value);
            var showStrokeColumn = isPie ? false : ((typeDD.selection.index === 0)
                ? strokeLinesChk.value
                : strokeBarsChk.value);

            fillHeader.visible = showFillColumn;
            strokeHeader.visible = showStrokeColumn;

            for (var index = 0; index < itemsToRender.length; index++) {
                var itm = itemsToRender[index];
                var sName = itm.name;
                if (!CONFIG.activeSeriesColors[sName]) {
                    var defaultCol = resolvedColors[index % resolvedColors.length];
                    CONFIG.activeSeriesColors[sName] = { fill: defaultCol, stroke: defaultCol };
                }
                createDynamicColorRow(itm, index, itemsToRender.length, (isWideFormat && !isPie), showFillColumn, showStrokeColumn);
            }
            reflowUI();
        }

        function createDynamicColorRow(itemObj, index, totalCount, isWideFormat, showFillColumn, showStrokeColumn) {
            var sName = itemObj.name;
            var row = dynamicListGrp.add("group");
            row.orientation = "row";
            row.alignChildren = ["left", "center"];
            row.spacing = 3;

            var btnUp = row.add("button", undefined, "▲");
            btnUp.preferredSize = [18, 18];
            btnUp.helpTip = "Move series up in stack/order";
            btnUp.enabled = (index > 0);

            var btnDown = row.add("button", undefined, "▼");
            btnDown.preferredSize = [18, 18];
            btnDown.helpTip = "Move series down in stack/order";
            btnDown.enabled = (index < totalCount - 1);

            btnUp.onClick = function() {
                if (isWideFormat) {
                    var tempW = currentWideColumns[index];
                    currentWideColumns[index] = currentWideColumns[index - 1];
                    currentWideColumns[index - 1] = tempW;
                } else {
                    var tempL = currentLongSeriesOrder[index];
                    currentLongSeriesOrder[index] = currentLongSeriesOrder[index - 1];
                    currentLongSeriesOrder[index - 1] = tempL;
                }
                updateSeriesColorsUI();
            };

            btnDown.onClick = function() {
                if (isWideFormat) {
                    var tempW = currentWideColumns[index];
                    currentWideColumns[index] = currentWideColumns[index + 1];
                    currentWideColumns[index + 1] = tempW;
                } else {
                    var tempL = currentLongSeriesOrder[index];
                    currentLongSeriesOrder[index] = currentLongSeriesOrder[index + 1];
                    currentLongSeriesOrder[index + 1] = tempL;
                }
                updateSeriesColorsUI();
            };

            var chk = row.add("checkbox", undefined, "");
            chk.value = (itemObj.checked !== false);
            chk.preferredSize = [18, 18];
            chk.helpTip = "Include " + sName + " in chart";
            chk.onClick = function() {
                itemObj.checked = this.value;
            };

            var labelDisplay = sName.length > 11 ? sName.substring(0, 11) + ".." : sName;
            var lblWidth = 75;
            var lbl = row.add("statictext", undefined, labelDisplay);
            lbl.preferredSize = [lblWidth, 20];
            lbl.helpTip = sName;

            var fillSwatch = row.add("group", undefined);
            fillSwatch.preferredSize = [18, 18];
            setElementColor(fillSwatch, CONFIG.activeSeriesColors[sName].fill);

            var fillHex = row.add("edittext", undefined, aeColorToHex(CONFIG.activeSeriesColors[sName].fill));
            fillHex.preferredSize = [60, 20];

            fillSwatch.visible = showFillColumn;
            fillHex.visible = showFillColumn;

            var strokeSwatch = row.add("group", undefined);
            strokeSwatch.preferredSize = [18, 18];
            setElementColor(strokeSwatch, CONFIG.activeSeriesColors[sName].stroke);

            var strokeHex = row.add("edittext", undefined, aeColorToHex(CONFIG.activeSeriesColors[sName].stroke));
            strokeHex.preferredSize = [60, 20];

            strokeSwatch.visible = showStrokeColumn;
            strokeHex.visible = showStrokeColumn;

            fillHex.onChange = (function(name, swatchRef, inputRef) {
                return function() {
                    var testCol = hexToAeColor(inputRef.text);
                    if (testCol !== null) {
                        CONFIG.activeSeriesColors[name].fill = testCol;
                        setElementColor(swatchRef, testCol);
                        inputRef.text = aeColorToHex(testCol);
                    } else {
                        inputRef.text = aeColorToHex(CONFIG.activeSeriesColors[name].fill);
                    }
                };
            })(sName, fillSwatch, fillHex);

            strokeHex.onChange = (function(name, swatchRef, inputRef) {
                return function() {
                    var testCol = hexToAeColor(inputRef.text);
                    if (testCol !== null) {
                        CONFIG.activeSeriesColors[name].stroke = testCol;
                        setElementColor(swatchRef, testCol);
                        inputRef.text = aeColorToHex(testCol);
                    } else {
                        inputRef.text = aeColorToHex(CONFIG.activeSeriesColors[name].stroke);
                    }
                };
            })(sName, strokeSwatch, strokeHex);
        }

        function executeTransposition() {
            var rawText = csvInput.text;
            var dChar = resolveDelimiter();
            var lines = rawText.split(/\r?\n/);
            var grid = [];
            for (var l = 0; l < lines.length; l++) {
                var lineClean = lines[l].replace(/^\s+|\s+$/g, '');
                if (lineClean !== "") {
                    grid.push(splitLine(lines[l], dChar));
                }
            }
            if (grid.length > 0) {
                var transposedGrid = [];
                var maxCols = 0;
                for (var r = 0; r < grid.length; r++) {
                    if (grid[r].length > maxCols) maxCols = grid[r].length;
                }
                for (var c = 0; c < maxCols; c++) {
                    var newRow = [];
                    for (var r = 0; r < grid.length; r++) {
                        newRow.push(grid[r][c] || "");
                    }
                    transposedGrid.push(newRow.join(dChar));
                }
                csvInput.text = transposedGrid.join("\n"); 
                updateInspectBox();
                loadBtn.onClick();
            }
        }

        transposeBtn.onClick = executeTransposition;

        csvInput.onChange = csvInput.onChanging = updateInspectBox;
        delimInput.onChange = updateInspectBox;
        skipHeaderIn.onChange = function() {
            updateInspectBox();
            updateSeriesColorsUI();
        };

        formatDD.onChange = function() {
            var isWide = formatDD.selection.index === 0;
            var isLine = typeDD.selection.index === 0;
            var isPie = typeDD.selection.index === 2;
            xRowGrp.visible = true;
            groupRowGrp.visible = !isLine && !isPie;
            yRowGrp.visible = !isWide;
            valueLabelsRowGrp.visible = !isWide;
            sRowGrp.visible = !isWide;
            wideFormatInfoTxt.visible = isWide;
            
            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10) || 0;
            var raw = getSanitizedLines(csvInput.text, skipCount);
            if (raw.length > 0) {
                var headers = parseHeaders(raw[0], dChar);
                if (isWide) {
                    fill(sDD, [headers[0]]);
                    fill(yDD, ["Value"]);
                } else {
                    fill(yDD, headers);
                    fill(sDD, headers);
                }
            }
            updateSeriesColorsUI();
            reflowUI();
        };

        typeDD.onChange = function() {
            var idx = typeDD.selection.index;
            var isLine = (idx === 0);
            var isBar = (idx === 1);
            var isPie = (idx === 2);

            // Contextual Axis Setup Labels for Pie vs Line/Bar
            if (isPie) {
                xLabel.text = "Slices (Cat):";
                sLabel.text = "Pie Group:";
                yLabel.text = "Values:";
            } else {
                xLabel.text = "X-Axis:";
                sLabel.text = "Series:";
                yLabel.text = "Y-Axis:";
            }

            groupRowGrp.visible = isBar;
            lineStyleGrp.visible = isLine;
            barStyleGrp.visible = isBar;
            pieStyleGrp.visible = isPie;
            layoutGrp.visible = isBar;

            gridConfigGrp.visible = !isPie;
            refLineGrp.visible = !isPie;

            togglesRow1.visible = !isPie;
            pieTextPosGrp.visible = isPie;
            showPctChk.visible = isPie;

            if (isPie) {
                valueLabelPosLabel.text = "Value Labels:";
                fill(valueLabelPosDD, ["Inside", "Outside"]);
            } else {
                valueLabelPosLabel.text = "Label Position:";
                fill(valueLabelPosDD, ["Above Bar / Node", "Center of Bar"]);
            }

            updateSeriesColorsUI();
            updateTotalSumVisibility();
            reflowUI();
        };

        fillLinesChk.onClick = function() {
            customFillChk.visible = fillLinesChk.value;
            areaStackChk.visible = fillLinesChk.value;
            if (!fillLinesChk.value) {
                areaStackChk.value = false;
                customFillChk.value = false;
            }
            fillOpacityLabel.visible = fillLinesChk.value && customFillChk.value;
            fillOpacityIn.visible = fillLinesChk.value && customFillChk.value;
            updateSeriesColorsUI();
            updateTotalSumVisibility();
            reflowUI();
        };

        areaStackChk.onClick = updateTotalSumVisibility;
        barStackChk.onClick = updateTotalSumVisibility;

        customFillChk.onClick = function() {
            fillOpacityLabel.visible = fillLinesChk.value && customFillChk.value;
            fillOpacityIn.visible = fillLinesChk.value && customFillChk.value;
            updateSeriesColorsUI();
            reflowUI();
        };

        strokeLinesChk.onClick = updateSeriesColorsUI;
        fillBarsChk.onClick = updateSeriesColorsUI;
        strokeBarsChk.onClick = updateSeriesColorsUI;

        xAxisPosDD.onChange = function() {
            customXAxisLevelInput.visible = (xAxisPosDD.selection.index === 2);
            reflowUI();
        };

        customYRangeChk.onClick = function() {
            minYInput.enabled = customYRangeChk.value;
            maxYInput.enabled = customYRangeChk.value;
        };

        animateGraphChk.onClick = function() {
            var isAnim = animateGraphChk.value;
            syncXLabelsChk.enabled = isAnim;
            totalDurIn.enabled = isAnim;
            elemDurIn.enabled = isAnim;
            animateAxesChk.enabled = isAnim;
        };

        browseBtn.onClick = function() {
            var importedFile = File.openDialog("Select CSV or Text Spreadsheet File", "Comma Separated Values:*.csv,Text Files:*.txt,Tab Separated Values:*.tsv");
            if (importedFile) {
                if (importedFile.open("r")) {
                    var content = importedFile.read();
                    importedFile.close();
                    csvInput.text = content;
                    updateInspectBox();
                    currentWideColumns = [];
                    currentLongSeriesOrder = [];
                    updateSeriesColorsUI();
                }
            }
        };

        loadBtn.onClick = function() {
            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10);
            if (isNaN(skipCount) || skipCount < 0) skipCount = 0;
            var rawLines = getSanitizedLines(csvInput.text, skipCount);
            if (!rawLines.length || rawLines[0] === "") return;
            
            var headers = parseHeaders(rawLines[0], dChar);
            var isWide = formatDD.selection.index === 0;
            
            fill(xDD, headers);
            updateGroupDropdownOptions(headers);
            
            if (headers.length > 1 && isWide) {
                var lowerH1 = headers[1].toLowerCase();
                if (lowerH1 === "scenario" || lowerH1 === "cluster" || lowerH1 === "group") {
                    for (var gItemIdx = 0; gItemIdx < groupDD.items.length; gItemIdx++) {
                        if (groupDD.items[gItemIdx].text === headers[1]) {
                            groupDD.selection = gItemIdx;
                            break;
                        }
                    }
                }
            }

            if (isWide) {
                fill(sDD, [headers[0]]); 
                fill(yDD, ["Value"]);
                fill(valueLabelDD, ["None"].concat(headers));
            } else {
                fill(yDD, headers);
                fill(sDD, headers);
                fill(valueLabelDD, ["None"].concat(headers));
            }

            currentWideColumns = [];
            currentLongSeriesOrder = [];
            rebuildColumnChecklist(headers, safeDD(xDD), safeDD(groupDD));
            updateSeriesColorsUI();
            updateTotalSumVisibility();
            tabGroup.selection = tabMapColors;
            reflowUI();
            updateTabScrollbar();
        };

        function updateGroupDropdownOptions(headers) {
            var currentX = safeDD(xDD);
            var currentGroup = safeDD(groupDD);
            var availableGroupCols = ["None"];
            for (var i = 0; i < headers.length; i++) {
                if (headers[i] !== currentX) {
                    availableGroupCols.push(headers[i]);
                }
            }
            fill(groupDD, availableGroupCols);
            if (currentGroup && currentGroup !== currentX && availableGroupCols.indexOf(currentGroup) !== -1) {
                for (var idx = 0; idx < groupDD.items.length; idx++) {
                    if (groupDD.items[idx].text === currentGroup) {
                        groupDD.selection = idx;
                        break;
                    }
                }
            } else {
                groupDD.selection = 0;
            }
        }

        tabGroup.onChange = function() {
            if (tabGroup.selection === tabMapColors) {
                updateSeriesColorsUI();
            }
            reflowUI();
            updateTabScrollbar();
        };

        xDD.onChange = function() {
            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10) || 0;
            var raw = getSanitizedLines(csvInput.text, skipCount);
            if (raw.length > 0) {
                var headers = parseHeaders(raw[0], dChar);
                updateGroupDropdownOptions(headers);
                rebuildColumnChecklist(headers, safeDD(xDD), safeDD(groupDD));
                updateSeriesColorsUI();
            }
        };

        groupDD.onChange = function() {
            var selectedGroup = safeDD(groupDD);
            var selectedX = safeDD(xDD);
            if (selectedGroup && selectedGroup !== "None" && selectedGroup === selectedX) {
                groupDD.selection = 0;
            }
            var hasGroup = groupDD.selection && groupDD.selection.index > 0;
            showSubLabelsChk.visible = hasGroup;
            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10) || 0;
            var raw = getSanitizedLines(csvInput.text, skipCount);
            if (raw.length > 0) {
                var headers = parseHeaders(raw[0], dChar);
                rebuildColumnChecklist(headers, safeDD(xDD), safeDD(groupDD));
            }
            reflowUI();
        };

        sDD.onChange = updateSeriesColorsUI;
        yDD.onChange = updateSeriesColorsUI;

        genBtn.onClick = function(){
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                statusTxt.text = "Error: Please select or open an active Composition.";
                return;
            }

            var dChar = resolveDelimiter();
            var skipCount = parseInt(skipHeaderIn.text, 10);
            if (isNaN(skipCount) || skipCount < 0) skipCount = 0;
            var raw = getSanitizedLines(csvInput.text, skipCount);
            if (raw.length < 2) {
                statusTxt.text = "Error: Not enough data rows in table.";
                return;
            }
            
            var headers = parseHeaders(raw[0], dChar);
            var isWideFormat = formatDD.selection.index === 0;

            var xVal = safeDD(xDD) || headers[0];
            var groupVal = safeDD(groupDD);
            if (groupVal === "None" || groupVal === "(None)") groupVal = null;

            var yVal = isWideFormat ? "Value" : safeDD(yDD);
            var sVal = isWideFormat ? "Series" : safeDD(sDD);
            var valueLabelVal = isWideFormat ? null : safeDD(valueLabelDD);
            if (valueLabelVal === "None" || valueLabelVal === "(None)") valueLabelVal = null;

            var normalizedData = [];

            var activeWideCols = [];
            if (isWideFormat) {
                if (currentWideColumns.length === 0) {
                    rebuildColumnChecklist(headers, xVal, groupVal);
                }
                for (var wIdx = 0; wIdx < currentWideColumns.length; wIdx++) {
                    if (currentWideColumns[wIdx].checked) {
                        activeWideCols.push(currentWideColumns[wIdx].name);
                    }
                }
                if (activeWideCols.length === 0) {
                    for (var fallbackW = 0; fallbackW < currentWideColumns.length; fallbackW++) {
                        currentWideColumns[fallbackW].checked = true;
                        activeWideCols.push(currentWideColumns[fallbackW].name);
                    }
                }
                if (activeWideCols.length === 0) return;

                var xColIdx = headers.indexOf(xVal);
                if (xColIdx === -1) xColIdx = 0; 
                var groupColIdx = groupVal ? headers.indexOf(groupVal) : -1;

                var validRowStep = 0;
                for (var rIdx = 1; rIdx < raw.length; rIdx++) {
                    var rowCells = splitLine(raw[rIdx], dChar);
                    var catValName = (xColIdx !== -1 && rowCells[xColIdx] !== undefined && rowCells[xColIdx] !== "") 
                        ? rowCells[xColIdx] 
                        : ("Row " + rIdx); 
                    var groupValName = (groupColIdx !== -1 && rowCells[groupColIdx]) ? rowCells[groupColIdx] : null;

                    var hasAnyData = false;
                    for (var nIdx = 0; nIdx < activeWideCols.length; nIdx++) {
                        var seriesColName = activeWideCols[nIdx]; 
                        var colInHeadersIdx = headers.indexOf(seriesColName);
                        var cellRawValue = rowCells[colInHeadersIdx];
                        
                        if (cellRawValue === undefined || cellRawValue === null || cellRawValue === "") continue;

                        hasAnyData = true;
                        var obj = {};
                        obj[xVal] = catValName;          
                        obj[yVal] = cellRawValue;     
                        obj[sVal] = seriesColName;    
                        obj["_row_step"] = validRowStep;
                        if (groupValName) obj["_sub_group"] = groupValName;
                        normalizedData.push(obj);
                    }
                    if (hasAnyData) validRowStep++;
                }
            } else {
                var activeLongSeries = [];
                for (var lIdx = 0; lIdx < currentLongSeriesOrder.length; lIdx++) {
                    if (currentLongSeriesOrder[lIdx].checked !== false) {
                        activeLongSeries.push(currentLongSeriesOrder[lIdx].name);
                    }
                }

                var validRowStepLong = 0;
                for (var i = 1; i < raw.length; i++) {
                    var r = splitLine(raw[i], dChar);
                    var obj = {};
                    for (var j = 0; j < headers.length; j++) obj[headers[j]] = r[j] ? r[j] : "";
                    if (obj[xVal] !== "" || obj[yVal] !== "") {
                        var checkKey = (sVal && headers.indexOf(sVal) !== -1) ? sVal : (xVal && headers.indexOf(xVal) !== -1 ? xVal : null);
                        if (checkKey && obj[checkKey] !== undefined) {
                            var itemVal = obj[checkKey].toString().replace(/^\s+|\s+$/g, '');
                            if (activeLongSeries.indexOf(itemVal) === -1) continue;
                        }
                        if (valueLabelVal) obj["_value_label"] = r[headers.indexOf(valueLabelVal)] || "";
                        if (groupVal) obj["_sub_group"] = obj[groupVal];
                        obj["_row_step"] = validRowStepLong;
                        normalizedData.push(obj);
                        validRowStepLong++;
                    }
                }
            }

            if (normalizedData.length === 0) {
                statusTxt.text = "Error: No valid data rows could be compiled.";
                return;
            }

            var selectedChartType = safeDD(typeDD) || "Line";
            statusTxt.text = "Generating " + selectedChartType + "...";

            app.beginUndoGroup("Generate Animated Chart");
            try {
                if (selectedChartType === "Pie / Donut") {
                    var selectedPieValPos = (safeDD(valueLabelPosDD) === "Outside") ? "Outside" : "Inside";
                    drawPieChartSystem(comp, normalizedData, isWideFormat, activeWideCols, xVal, yVal, sVal, {
                        isDonut: donutChk.value,
                        holePct: num(holeSizeIn.text),
                        maxRadius: num(maxRadiusIn.text),
                        showPct: showPctChk.value,
                        animate: animateGraphChk.value,
                        totDuration: num(totalDurIn.text),
                        font: fontDD.selection ? fontDD.selection.text : "Helvetica",
                        fontSize: num(fontSizeIn.text),
                        thousandsSep: thousandsSepInput.text,
                        decSep: decSepInput.text,
                        valDecimals: safeDD(valDecimalsDD),
                        drawLegend: legendChk.value,
                        legendPos: safeDD(legendAlignDD) || "Top Right",
                        legendOrient: safeDD(legendOrientDD) || "Vertical",
                        title: titleInput.text,
                        palettePreset: safeDD(palettePresetDD) || "Palette 1",
                        drawXLabels: xLabelChk.value,
                        drawYLabels: yLabelChk.value,
                        drawValues: valueLabelChk.value,
                        drawTotalSum: drawTotalSumChk.value,
                        textPos: safeDD(pieTextPosDD) || "Outside",
                        valPos: selectedPieValPos
                    });
                } else {
                    var isStackedValue = (selectedChartType === "Bar") ? barStackChk.value : (fillLinesChk.value && areaStackChk.value);
                    drawGraph(
                        comp, normalizedData, xVal, yVal, sVal, selectedChartType, dotChk.value, 
                        xGridChk.value, yGridChk.value, xLabelChk.value, yLabelChk.value, valueLabelChk.value,
                        num(barWidthInput.text), num(barGapInput.text), fillBarsChk.value, strokeBarsChk.value,
                        strokeLinesChk.value, fillLinesChk.value, fontDD.selection ? fontDD.selection.text : "Helvetica",
                        isStackedValue, thousandsSepInput.text, titleInput.text, safeDD(xTickDD), safeDD(yTickDD),
                        num(axisWidthIn.text), num(gridWidthIn.text), animateAxesChk.value, num(fontSizeIn.text),
                        num(strokeWidthIn.text), legendChk.value, safeDD(legendAlignDD) || "Top Right",
                        customFillChk.value, num(fillOpacityIn.text), valueLabelVal, yAxisRightChk.value,
                        safeDD(valueLabelPosDD), drawTotalSumChk.value, safeDD(legendOrientDD) || "Vertical",
                        customYRangeChk.value, num(minYInput.text), num(maxYInput.text), decSepInput.text,
                        safeDD(yDecimalsDD), safeDD(valDecimalsDD), safeDD(xAxisPosDD), num(customXAxisLevelInput.text),
                        animateGraphChk.value, num(totalDurIn.text), num(elemDurIn.text), syncXLabelsChk.value,
                        safeDD(yDivisionsDD), showSubLabelsChk.value, groupVal, preserveXOrderChk.value,
                        drawRefLineChk.value, safeDD(refLineAxisDD), refLineValIn.text, safeDD(refLineStyleDD),
                        num(refLineWidthIn.text), refLineDefaultColor, refLineLabelIn.text, animateRefLineChk.value,
                        safeDD(barOrientationDD) || "Vertical"
                    );
                }
                statusTxt.text = "Graph generated successfully!";
            } catch(err) {
                statusTxt.text = "Error: " + err.toString();
                $.writeln("An error occurred during generation: " + err.toString());
            }
            handledSelectionRestore();
            app.endUndoGroup();
        };

        typeDD.onChange();
        formatDD.onChange();
        updateInspectBox();

        if (win instanceof Window) {
            win.minimumSize = [440, 560];
            win.size = [470, 630];
        }
        return win;
    }

    function drawPieChartSystem(comp, normalizedData, isWideFormat, activeWideCols, xKey, yKey, sKey, cfg) {
        var columns = [];
        if (isWideFormat && activeWideCols && activeWideCols.length > 0) {
            columns = activeWideCols;
        } else {
            var distinctGroups = [];
            for (var d = 0; d < normalizedData.length; d++) {
                var gVal = (xKey && xKey !== "(None)" && normalizedData[d][xKey] !== undefined)
                    ? normalizedData[d][xKey].toString().replace(/^\s+|\s+$/g, '')
                    : "Value";
                if (gVal !== "" && distinctGroups.indexOf(gVal) === -1) {
                    distinctGroups.push(gVal);
                }
            }
            columns = distinctGroups.length > 0 ? distinctGroups : ["Value"];
        }

        var colDataMap = {};
        var colTotals = {};
        var maxTotal = 0;

        // Build active slices filter to honor user selection checkboxes in the preview UI
        var activeSliceFilter = [];
        if (typeof currentLongSeriesOrder !== "undefined" && currentLongSeriesOrder && currentLongSeriesOrder.length > 0) {
            for (var sf = 0; sf < currentLongSeriesOrder.length; sf++) {
                if (currentLongSeriesOrder[sf].checked !== false) {
                    activeSliceFilter.push(currentLongSeriesOrder[sf].name || currentLongSeriesOrder[sf]);
                }
            }
        }

        for (var c = 0; c < columns.length; c++) {
            var colName = columns[c];
            colDataMap[colName] = [];
            var sum = 0;

            for (var i = 0; i < normalizedData.length; i++) {
                var row = normalizedData[i];
                var match = isWideFormat 
                    ? (row[sKey] === colName) 
                    : ((xKey && xKey !== "(None)") ? (row[xKey] === colName) : true);

                if (match) {
                    var rawVal = num(row[yKey]);
                    var catName = isWideFormat 
                        ? ((row[xKey] !== undefined && row[xKey] !== null) ? row[xKey].toString() : ("Slice " + (i + 1)))
                        : ((row[sKey] !== undefined && row[sKey] !== null) ? row[sKey].toString() : ("Slice " + (i + 1)));

                    // If checkboxes were unchecked in UI, filter slice out
                    if (activeSliceFilter.length > 0 && activeSliceFilter.indexOf(catName) === -1) {
                        continue;
                    }

                    if (rawVal > 0) {
                        var existingSlice = null;
                        for (var es = 0; es < colDataMap[colName].length; es++) {
                            if (colDataMap[colName][es].name === catName) {
                                existingSlice = colDataMap[colName][es];
                                break;
                            }
                        }
                        if (existingSlice) {
                            existingSlice.value += rawVal;
                        } else {
                            colDataMap[colName].push({ name: catName, value: rawVal });
                        }
                        sum += rawVal;
                    }
                }
            }
            colTotals[colName] = sum;
            if (sum > maxTotal) maxTotal = sum;
        }

        if (maxTotal <= 0) return;

        var distinctSliceNames = [];
        for (var colK in colDataMap) {
            var sArr = colDataMap[colK];
            for (var sa = 0; sa < sArr.length; sa++) {
                if (distinctSliceNames.indexOf(sArr[sa].name) === -1) {
                    distinctSliceNames.push(sArr[sa].name);
                }
            }
        }

        if (typeof currentLongSeriesOrder !== "undefined" && currentLongSeriesOrder && currentLongSeriesOrder.length > 0) {
            var orderedSliceNames = [];
            for (var cso = 0; cso < currentLongSeriesOrder.length; cso++) {
                var cName = currentLongSeriesOrder[cso].name || currentLongSeriesOrder[cso];
                if (distinctSliceNames.indexOf(cName) !== -1) {
                    orderedSliceNames.push(cName);
                }
            }
            for (var dso = 0; dso < distinctSliceNames.length; dso++) {
                if (orderedSliceNames.indexOf(distinctSliceNames[dso]) === -1) {
                    orderedSliceNames.push(distinctSliceNames[dso]);
                }
            }
            distinctSliceNames = orderedSliceNames;
        }

        // Sort slice items inside each pie group to honor slice order
        for (var colSortKey in colDataMap) {
            colDataMap[colSortKey].sort(function(a, b) {
                return distinctSliceNames.indexOf(a.name) - distinctSliceNames.indexOf(b.name);
            });
        }

        // Reserve margin space if a Vertical Legend is drawn to completely prevent graph/legend overlap
        var hasVerticalLegend = (cfg.drawLegend && distinctSliceNames.length > 0 && cfg.legendOrient !== "Horizontal");
        var isLeftLeg = (cfg.legendPos.indexOf("Left") !== -1);
        var legendReservedW = hasVerticalLegend ? Math.max(160, cfg.fontSize * 6.5) : 0;

        var numPies = columns.length;
        var usableWidth = comp.width - (CONFIG.margin * 2) - legendReservedW;
        var slotWidth = usableWidth / numPies;
        var startPiesX = CONFIG.margin + (hasVerticalLegend && isLeftLeg ? legendReservedW : 0);
        var centerY = comp.height / 2;

        var maxAllowedRadius = cfg.maxRadius && cfg.maxRadius > 0 ? cfg.maxRadius : 220;
        var maxSlotRadius = (slotWidth * 0.42);
        if (maxAllowedRadius > maxSlotRadius) maxAllowedRadius = maxSlotRadius;

        var resolvedPalette = resolveScaleColors(cfg.palettePreset || "Palette 1", Math.max(distinctSliceNames.length, 6));
        var sliceColorMap = {};
        for (var sn = 0; sn < distinctSliceNames.length; sn++) {
            var sNameKey = distinctSliceNames[sn];
            sliceColorMap[sNameKey] = (CONFIG.activeSeriesColors[sNameKey] && CONFIG.activeSeriesColors[sNameKey].fill) 
                ? CONFIG.activeSeriesColors[sNameKey].fill 
                : resolvedPalette[sn % resolvedPalette.length];
        }

        var labelsToElevate = [];

        for (var pIdx = 0; pIdx < numPies; pIdx++) {
            var pCol = columns[pIdx];
            var slices = colDataMap[pCol];
            var curTotal = colTotals[pCol];
            if (!slices || slices.length === 0 || curTotal <= 0) continue;

            var rRatio = (numPies > 1 && maxTotal > 0) ? Math.sqrt(curTotal / maxTotal) : 1.0;
            var R = Math.max(maxAllowedRadius * rRatio, 24);
            var isDonut = cfg.isDonut;
            var holeRatio = isDonut ? (Math.min(Math.max(cfg.holePct, 10), 90) / 100) : 0;
            var rInner = isDonut ? (R * holeRatio) : 0;
            var strokeW = isDonut ? (R - rInner) : R;
            var circleDiameter = isDonut ? (R + rInner) : R;

            var centerX = startPiesX + (pIdx * slotWidth) + (slotWidth / 2);

            var pieNull = comp.layers.addNull();
            pieNull.name = "PieGroup_" + pCol;
            var nullTrans = safeProperty(pieNull, "ADBE Transform Group", 3, "Transform");
            if (nullTrans) {
                var np = safeProperty(nullTrans, "ADBE Position", 2, "Position");
                if (np) np.setValue([centerX, centerY]);
            }

            if (cfg.drawYLabels && (numPies > 1 || pCol !== "Value")) {
                var colTitleY = centerY - R - 35;
                var colTitle = createText(comp, pCol, [centerX, colTitleY], "center", "Header_" + pCol, cfg.fontSize * 1.1);
                labelsToElevate.push(colTitle);
            }

            // Donut Center Total controlled by Show Stack Totals toggle
            if (isDonut && cfg.drawTotalSum) {
                var totalDisplay = formatNumber(curTotal, 0, cfg.thousandsSep, cfg.decSep);
                var totalTextLayer = createText(comp, totalDisplay, [centerX, centerY + (cfg.fontSize * 0.35)], "center", "Total_" + pCol, cfg.fontSize * 1.2);
                labelsToElevate.push(totalTextLayer);
                if (cfg.animate) {
                    var ttTrans = safeProperty(totalTextLayer, "ADBE Transform Group", 3, "Transform");
                    if (ttTrans) {
                        var ttOp = safeProperty(ttTrans, "ADBE Opacity", 11, "Opacity");
                        if (ttOp) {
                            ttOp.setValueAtTime(cfg.totDuration * 0.5, 0);
                            ttOp.setValueAtTime(cfg.totDuration, 100);
                        }
                    }
                }
            }

            // Build synchronized sequential timeline where slices stick to the leading sweep edge
            var runningAngleDeg = 0;
            var sliceTimeline = [];
            var cumulativeTime = 0;
            var baseTotDuration = Math.max(cfg.totDuration, 0.5);

            for (var st = 0; st < slices.length; st++) {
                var sVal = slices[st].value;
                var sAngleDeg = (sVal / curTotal) * 360;
                var sPct = (sVal / curTotal);
                var sDuration = Math.max((sVal / curTotal) * baseTotDuration, 0.1);
                var sStartTime = cumulativeTime;
                var sEndTime = sStartTime + sDuration;

                sliceTimeline.push({
                    startAngleDeg: runningAngleDeg,
                    sweepDeg: sAngleDeg,
                    pct: sPct,
                    startTime: sStartTime,
                    endTime: sEndTime
                });
                runningAngleDeg += sAngleDeg;
                cumulativeTime = sEndTime;
            }

            for (var s = 0; s < slices.length; s++) {
                var sliceObj = slices[s];
                var sTimeInfo = sliceTimeline[s];
                var sliceCol = sliceColorMap[sliceObj.name];

                var sliceLayer = comp.layers.addShape();
                sliceLayer.name = "Slice_" + pCol + "_" + sliceObj.name;
                sliceLayer.parent = pieNull;

                var sLayerTrans = safeProperty(sliceLayer, "ADBE Transform Group", 3, "Transform");
                if (sLayerTrans) {
                    var slp = safeProperty(sLayerTrans, "ADBE Position", 2, "Position");
                    if (slp) slp.setValue([0, 0]);
                    var slap = safeProperty(sLayerTrans, "ADBE Anchor Point", 1, "Anchor Point");
                    if (slap) slap.setValue([0, 0]);
                }

                var rootContents = safeProperty(sliceLayer, "ADBE Root Vectors Group", 2, "Contents");
                if (rootContents) {
                    var grp = rootContents.addProperty("ADBE Vector Group");
                    grp.name = "SliceShape";
                    var grpContents = safeProperty(grp, "ADBE Vectors Group", 2, "Contents");
                    if (grpContents) {
                        var ell = grpContents.addProperty("ADBE Vector Shape - Ellipse");
                        if (ell) {
                            var sz = safeProperty(ell, "ADBE Vector Ellipse Size", 1, "Size");
                            if (sz) sz.setValue([circleDiameter, circleDiameter]);
                        }

                        var sStroke = grpContents.addProperty("ADBE Vector Graphic - Stroke");
                        if (sStroke) {
                            var sc = safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color");
                            if (sc) sc.setValue(sliceCol);
                            var sw = safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                            if (sw) sw.setValue(strokeW);
                        }

                        var sTrim = grpContents.addProperty("ADBE Vector Filter - Trim");
                        var trimEnd = null;
                        if (sTrim) {
                            var trimStart = safeProperty(sTrim, "ADBE Vector Trim Start", 1, "Start");
                            if (trimStart) trimStart.setValue(0);
                            trimEnd = safeProperty(sTrim, "ADBE Vector Trim End", 2, "End");
                            var trimOffset = safeProperty(sTrim, "ADBE Vector Trim Offset", 3, "Offset");
                            if (trimOffset) trimOffset.setValue(0);
                        }

                        var sliceAnglePct = (sliceObj.value / curTotal) * 100;
                        var sRotProp = safeProperty(sLayerTrans, "ADBE Rotate Z", 6, "Rotation");

                        if (cfg.animate) {
                            if (trimEnd) {
                                trimEnd.setValueAtTime(0, 0);
                                if (sTimeInfo.startTime > 0) {
                                    trimEnd.setValueAtTime(sTimeInfo.startTime, 0);
                                }
                                trimEnd.setValueAtTime(sTimeInfo.endTime, sliceAnglePct);
                                try {
                                    var easeT = new KeyframeEase(0, 33);
                                    for (var kt = 1; kt <= trimEnd.numKeys; kt++) {
                                        trimEnd.setTemporalEaseAtKey(kt, [easeT], [easeT]);
                                    }
                                } catch(eTrimEase) {}
                            }

                            if (sRotProp) {
                                sRotProp.setValueAtTime(0, 0);
                                var angleTrack = 0;
                                for (var pIdxPrev = 0; pIdxPrev < s; pIdxPrev++) {
                                    var prevInfo = sliceTimeline[pIdxPrev];
                                    angleTrack += prevInfo.sweepDeg;
                                    sRotProp.setValueAtTime(prevInfo.endTime, angleTrack);
                                }
                                try {
                                    var easeR = new KeyframeEase(0, 33);
                                    for (var kr = 1; kr <= sRotProp.numKeys; kr++) {
                                        sRotProp.setTemporalEaseAtKey(kr, [easeR], [easeR]);
                                    }
                                } catch(eRotEase) {}
                            }
                        } else {
                            if (trimEnd) trimEnd.setValue(sliceAnglePct);
                            if (sRotProp) sRotProp.setValue(sTimeInfo.startAngleDeg);
                        }
                    }
                }

                // Slices draw clockwise starting at 12 o'clock (0 deg).
                var midAngleDeg = sTimeInfo.startAngleDeg + (sTimeInfo.sweepDeg / 2);
                var midAngleRad = midAngleDeg * (Math.PI / 180);

                var isTextInside = (cfg.textPos === "Inside");
                var isValInside = (cfg.valPos === "Inside");

                var ringCenterRadius = isDonut ? ((R + rInner) / 2) : (R * 0.55);
                var radialBaseOutside = R + (cfg.fontSize * 0.85);

                var textRadius = isTextInside ? ringCenterRadius : radialBaseOutside;
                var valRadius = isValInside ? ringCenterRadius : radialBaseOutside;

                if (!isTextInside && !isValInside) {
                    textRadius = radialBaseOutside;
                    valRadius = radialBaseOutside + (cfg.fontSize * 0.95);
                }

                if (isTextInside && isValInside) {
                    var availableHalf = isDonut ? ((R - rInner) * 0.22) : (R * 0.14);
                    var offsetAmount = Math.min(availableHalf, cfg.fontSize * 0.45);
                    textRadius = ringCenterRadius - offsetAmount;
                    valRadius = ringCenterRadius + offsetAmount;
                }

                var baselineShift = cfg.fontSize * 0.32;

                var tx = centerX + Math.sin(midAngleRad) * textRadius;
                var ty = centerY - Math.cos(midAngleRad) * textRadius + baselineShift;

                var vx = centerX + Math.sin(midAngleRad) * valRadius;
                var vy = centerY - Math.cos(midAngleRad) * valRadius + baselineShift;

                // Text Label Layer (Category Name)
                if (cfg.drawXLabels) {
                    var sliceTxtLayer = createText(comp, sliceObj.name, [tx, ty], "center", "TxtLabel_" + sliceObj.name, cfg.fontSize * 0.75);
                    labelsToElevate.push(sliceTxtLayer);

                    var tTrans = safeProperty(sliceTxtLayer, "ADBE Transform Group", 3, "Transform");
                    if (tTrans) {
                        var tOp = safeProperty(tTrans, "ADBE Opacity", 11, "Opacity");
                        if (tOp) {
                            if (cfg.animate) {
                                tOp.setValueAtTime(sTimeInfo.endTime * 0.6, 0);
                                tOp.setValueAtTime(sTimeInfo.endTime + 0.2, 100);
                            } else {
                                tOp.setValue(100);
                            }
                        }
                    }
                }

                // Value Label Layer (Numeric Value and/or Percentage)
                var valParts = [];
                if (cfg.drawValues) {
                    var decCount = (cfg.valDecimals && cfg.valDecimals !== "Auto") ? parseInt(cfg.valDecimals, 10) : 0;
                    valParts.push(formatNumber(sliceObj.value, decCount, cfg.thousandsSep, cfg.decSep));
                }
                if (cfg.showPct) {
                    var pctVal = (sliceObj.value / curTotal) * 100;
                    valParts.push(pctVal.toFixed(1) + "%");
                }

                if (valParts.length > 0) {
                    var valLabelStr = valParts.join(" (") + (valParts.length > 1 ? ")" : "");
                    var sliceValLayer = createText(comp, valLabelStr, [vx, vy], "center", "ValLabel_" + sliceObj.name, cfg.fontSize * 0.75);
                    labelsToElevate.push(sliceValLayer);

                    var vTrans = safeProperty(sliceValLayer, "ADBE Transform Group", 3, "Transform");
                    if (vTrans) {
                        var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                        if (vOp) {
                            if (cfg.animate) {
                                vOp.setValueAtTime(sTimeInfo.endTime * 0.6, 0);
                                vOp.setValueAtTime(sTimeInfo.endTime + 0.2, 100);
                            } else {
                                vOp.setValue(100);
                            }
                        }
                    }
                }
            }
        }

        if (cfg.drawLegend && distinctSliceNames.length > 0) {
            var legendLayer = makeShapeLayer(comp, "Pie_Legend");
            var legContents = safeProperty(legendLayer, "ADBE Root Vectors Group", 2, "Contents");
            if (legContents) {
                var itemH = cfg.fontSize * 1.5;
                var swatchSz = cfg.fontSize * 0.9;
                var gap = cfg.fontSize * 0.4;
                var isLeft = (cfg.legendPos.indexOf("Left") !== -1);
                var isBottom = (cfg.legendPos.indexOf("Bottom") !== -1);
                var isCenterY = (cfg.legendPos.indexOf("Center") !== -1);

                if (cfg.legendOrient === "Horizontal") {
                    var itemSpacing = cfg.fontSize * 1.0;
                    var itemWidths = [];
                    var totalLegWidth = 0;
                    for (var li = 0; li < distinctSliceNames.length; li++) {
                        var sName = distinctSliceNames[li];
                        var itmW = swatchSz + gap + (sName.length * cfg.fontSize * 0.55) + itemSpacing;
                        itemWidths.push(itmW);
                        totalLegWidth += itmW;
                    }

                    var startX = isLeft ? (CONFIG.margin + 20) : (comp.width - CONFIG.margin - 20 - totalLegWidth);
                    if (cfg.legendPos.indexOf("Center") !== -1 && !isLeft && cfg.legendPos.indexOf("Right") === -1) {
                        startX = (comp.width - totalLegWidth) / 2;
                    }
                    if (startX < CONFIG.margin) startX = CONFIG.margin;

                    var legY = isBottom 
                        ? (comp.height - CONFIG.margin / 2 + 10) 
                        : ((cfg.title && cfg.title !== "") ? (CONFIG.margin - itemH - 4) : (CONFIG.margin / 2));

                    var curX = startX;
                    for (var li = 0; li < distinctSliceNames.length; li++) {
                        var legName = distinctSliceNames[li];
                        var legColor = sliceColorMap[legName];
                        var symX = curX + (swatchSz / 2);
                        var symY = legY;

                        var lGrp = legContents.addProperty("ADBE Vector Group");
                        lGrp.name = "Leg_" + legName;
                        var lGrpCont = safeProperty(lGrp, "ADBE Vectors Group", 2, "Contents");
                        if (lGrpCont) {
                            var lRect = lGrpCont.addProperty("ADBE Vector Shape - Rect");
                            if (lRect) {
                                safeProperty(lRect, "ADBE Vector Rect Size", 1, "Size").setValue([swatchSz, swatchSz]);
                                safeProperty(lRect, "ADBE Vector Rect Position", 2, "Position").setValue([symX, symY]);
                            }
                            var lFill = lGrpCont.addProperty("ADBE Vector Graphic - Fill");
                            if (lFill) safeProperty(lFill, "ADBE Vector Fill Color", 4, "Color").setValue(legColor);
                        }

                        var legTxt = createText(comp, legName, [curX + swatchSz + gap, symY + (cfg.fontSize * 0.32)], "left", "LegTxt_" + legName, cfg.fontSize * 0.85);
                        labelsToElevate.push(legTxt);

                        curX += itemWidths[li];
                    }
                } else {
                    var legX = isLeft ? (CONFIG.margin + 15) : (comp.width - CONFIG.margin - legendReservedW + 25);
                    var totalLegH = distinctSliceNames.length * itemH;
                    var legY = isBottom 
                        ? (comp.height - CONFIG.margin - totalLegH) 
                        : (isCenterY ? (comp.height / 2) - (totalLegH / 2) : (CONFIG.margin + 20));

                    for (var li = 0; li < distinctSliceNames.length; li++) {
                        var legName = distinctSliceNames[li];
                        var itemY = legY + (li * itemH);
                        var legColor = sliceColorMap[legName];

                        var lGrp = legContents.addProperty("ADBE Vector Group");
                        lGrp.name = "Leg_" + legName;
                        var lGrpCont = safeProperty(lGrp, "ADBE Vectors Group", 2, "Contents");
                        if (lGrpCont) {
                            var lRect = lGrpCont.addProperty("ADBE Vector Shape - Rect");
                            if (lRect) {
                                safeProperty(lRect, "ADBE Vector Rect Size", 1, "Size").setValue([swatchSz, swatchSz]);
                                safeProperty(lRect, "ADBE Vector Rect Position", 2, "Position").setValue([legX, itemY]);
                            }
                            var lFill = lGrpCont.addProperty("ADBE Vector Graphic - Fill");
                            if (lFill) safeProperty(lFill, "ADBE Vector Fill Color", 4, "Color").setValue(legColor);
                        }

                        var legTxt = createText(comp, legName, [legX + swatchSz + gap, itemY + (cfg.fontSize * 0.32)], "left", "LegTxt_" + legName, cfg.fontSize * 0.85);
                        labelsToElevate.push(legTxt);
                    }
                }
            }
            if (legendLayer) legendLayer.moveToBeginning();
        }

        if (cfg.title && cfg.title !== "") {
            var pTitle = createText(comp, cfg.title, [comp.width / 2, CONFIG.margin / 2], "center", "Pie_Chart_Title", cfg.fontSize * 1.5);
            labelsToElevate.push(pTitle);
        }

        for (var el = 0; el < labelsToElevate.length; el++) {
            try {
                if (labelsToElevate[el]) labelsToElevate[el].moveToBeginning();
            } catch(eEl) {}
        }
    }

    function drawGraph(comp, data, xKey, yKey, sKey, type, dots, drawXAxis, drawYAxis, drawXLabels, drawYLabels, drawValues, customBarWidth, customBarGap, fillBars, strokeBars, strokeLines, fillLines, selectedFont, isStacked, separatorSymbol, graphTitleText, xTickStyle, yTickStyle, strokeWidthAxis, strokeWidthGrid, animateAxes, selectedFontSize, seriesStrokeWidth, drawLegend, legendPosition, customFill, customFillOpacity, valueCustomLabelKey, rightYAxis, valueLabelPos, drawTotalSum, legendOrientation, customYRange, customMinY, customMaxY, decSep, yDecimalsOpt, valDecimalsOpt, xAxisPosMode, customXAxisLevel, animateGraph, totalAnimDur, elemAnimDur, syncXLabelsPace, yDivisionsOpt, showSubLabels, subGroupKey, preserveXOrder, drawRefLine, refLineAxis, refLineVal, refLineStyle, refLineWidth, refLineColor, refLineLabel, animateRefLine, barOrientation){
        var isAnimated = (animateGraph !== false);
        var totDuration = isNaN(totalAnimDur) || totalAnimDur <= 0 ? 2.0 : totalAnimDur;
        var elemDuration = isNaN(elemAnimDur) || elemAnimDur <= 0 ? 1.0 : elemAnimDur;
        if (elemDuration > totDuration) elemDuration = totDuration;
        var staggerSpan = totDuration - elemDuration;

        var targetDivisions = 5;
        if (yDivisionsOpt && yDivisionsOpt !== "Auto (~5)" && yDivisionsOpt !== "Auto") {
            var parsedDiv = parseInt(yDivisionsOpt.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(parsedDiv) && parsedDiv > 0) targetDivisions = parsedDiv;
        }

        var margin = CONFIG.margin;
        var w = comp.width - margin*2;
        var h = comp.height - margin*2;

        var baseX = rightYAxis ? comp.width - margin : margin;
        var baseY = comp.height - margin;

        if (selectedFont && selectedFont !== "") CONFIG.fontFamily = selectedFont;

        var currentFontSize = isNaN(selectedFontSize) || selectedFontSize <= 0 ? CONFIG.fontSize : selectedFontSize;
        var currentStrokeWidth = isNaN(seriesStrokeWidth) || seriesStrokeWidth <= 0 ? CONFIG.lineWidth : seriesStrokeWidth;
        var axisStrokeWidth = isNaN(strokeWidthAxis) || strokeWidthAxis <= 0 ? 2 : strokeWidthAxis;
        var gridStrokeWidth = isNaN(strokeWidthGrid) || strokeWidthGrid <= 0 ? 1 : strokeWidthGrid;
        var resolvedGridColor = CONFIG.gridColor !== null ? CONFIG.gridColor : CONFIG.axisColor;

        if (type === "Bar" && !fillBars && !strokeBars) fillBars = true;
        if (type === "Line" && !strokeLines && !fillLines) strokeLines = true;

        var barWidthPct = Math.min(Math.max(customBarWidth, 10), 100) / 100;
        var clusterGapPct = Math.min(Math.max(customBarGap, 0), 90) / 100;

        var categories = [];
        var subClusters = [];
        
        var isStrictOrdered = (preserveXOrder === true);
        var isCategorical = (type === "Bar") || isStrictOrdered;

        if (isStrictOrdered) {
            var stepLabelMap = {};
            for (var i = 0; i < data.length; i++) {
                var step = (data[i]["_row_step"] !== undefined) ? data[i]["_row_step"] : categories.length;
                var rawX = data[i][xKey];
                var rawTrimmed = (rawX !== undefined && rawX !== null) ? rawX.toString().replace(/^\s+|\s+$/g, '') : ("" + step);
                if (stepLabelMap[step] === undefined) {
                    stepLabelMap[step] = rawTrimmed;
                    categories.push(rawTrimmed);
                }
                if (data[i]["_sub_group"]) {
                    var clTrimmed = data[i]["_sub_group"].toString().replace(/^\s+|\s+$/g, '');
                    if (subClusters.indexOf(clTrimmed) === -1) subClusters.push(clTrimmed);
                }
            }
        } else {
            for (var i = 0; i < data.length; i++) {
                var rawX = data[i][xKey];
                if (rawX === undefined || rawX === null) continue;
                var rawTrimmed = rawX.toString().replace(/^\s+|\s+$/g, '');
                if (categories.indexOf(rawTrimmed) === -1) categories.push(rawTrimmed);
                if (!isNumeric(rawTrimmed)) isCategorical = true;

                if (data[i]["_sub_group"]) {
                    var clTrimmed = data[i]["_sub_group"].toString().replace(/^\s+|\s+$/g, '');
                    if (subClusters.indexOf(clTrimmed) === -1) subClusters.push(clTrimmed);
                }
            }

            if (!isCategorical) {
                categories.sort(function(a, b) { return num(a) - num(b); });
            }
        }

        var series = {};
        for (var i = 0; i < data.length; i++) {
            var rawXVal = data[i][xKey];
            if (rawXVal === undefined || rawXVal === null) continue;
            var rawXClean = rawXVal.toString().replace(/^\s+|\s+$/g, '');

            var g = sKey && data[i][sKey] ? data[i][sKey].toString().replace(/^\s+|\s+$/g, '') : "Series";
            var stepIdx = (data[i]["_row_step"] !== undefined && isStrictOrdered) ? data[i]["_row_step"] : categories.indexOf(rawXClean);
            var xv = isCategorical ? stepIdx : num(rawXClean);
            var yv = num(data[i][yKey]);
            var subName = data[i]["_sub_group"] ? data[i]["_sub_group"].toString().replace(/^\s+|\s+$/g, '') : "_default";

            if (!series[g]) {
                var customCol = CONFIG.activeSeriesColors[g] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                series[g] = { points: [], fillColor: customCol.fill, strokeColor: customCol.stroke };
            }

            series[g].points.push({ 
                x: xv, y: yv, rawX: rawXClean, subGroup: subName, catIdx: stepIdx,
                valueLabel: data[i]["_value_label"] !== undefined ? data[i]["_value_label"] : null
            });
        }

        var groupNames = [];
        for (var k in CONFIG.activeSeriesColors) {
            if (series[k] && groupNames.indexOf(k) === -1) groupNames.push(k);
        }
        for (var k in series) {
            if (groupNames.indexOf(k) === -1) groupNames.push(k);
        }

        var rawMaxY = -Infinity;
        var rawMinY = Infinity;

        var stackTable = {}; 
        for (var c = 0; c < categories.length; c++) {
            stackTable[c] = {};
            if (subClusters.length > 0) {
                for (var sc = 0; sc < subClusters.length; sc++) {
                    stackTable[c][subClusters[sc]] = [];
                    for (var g = 0; g < groupNames.length; g++) stackTable[c][subClusters[sc]][g] = 0;
                }
            } else {
                stackTable[c]["_default"] = [];
                for (var g = 0; g < groupNames.length; g++) stackTable[c]["_default"][g] = 0;
            }
        }

        for (var name in series) {
            var gIdx = groupNames.indexOf(name);
            var pts = series[name].points;
            for (var p = 0; p < pts.length; p++) {
                var cIdx = pts[p].catIdx;
                var scKey = pts[p].subGroup || "_default";
                if (stackTable[cIdx] && stackTable[cIdx][scKey] !== undefined) {
                    stackTable[cIdx][scKey][gIdx] = pts[p].y;
                }
            }
        }

        for (var c = 0; c < categories.length; c++) {
            for (var scKey in stackTable[c]) {
                var sumPos = 0; var sumNeg = 0;
                for (var g = 0; g < groupNames.length; g++) {
                    var v = stackTable[c][scKey][g];
                    if (isStacked) {
                        if (v >= 0) sumPos += v; else sumNeg += v;
                    } else {
                        rawMaxY = Math.max(rawMaxY, v); rawMinY = Math.min(rawMinY, v);
                    }
                }
                if (isStacked) {
                    rawMaxY = Math.max(rawMaxY, sumPos); rawMinY = Math.min(rawMinY, sumNeg);
                }
            }
        }

        if (rawMaxY === -Infinity) rawMaxY = 10;
        if (rawMinY === Infinity) rawMinY = 0;

        var minY = 0; var maxY = 10; var niceStepY = 2;
        if (customYRange) {
            minY = customMinY; maxY = customMaxY;
            if (maxY <= minY) maxY = minY + 1;
            niceStepY = (maxY - minY) / targetDivisions;
        } else {
            if (rawMinY >= 0) {
                minY = 0; var range = rawMaxY <= 0 ? 1 : rawMaxY;
                niceStepY = getNiceStep(range, targetDivisions);
                maxY = Math.ceil(rawMaxY / niceStepY) * niceStepY;
                if (maxY === 0) maxY = niceStepY;
            } else {
                var absMax = Math.max(Math.abs(rawMaxY), Math.abs(rawMinY));
                niceStepY = getNiceStep(absMax * 2, targetDivisions);
                maxY = Math.ceil(rawMaxY / niceStepY) * niceStepY;
                minY = Math.floor(rawMinY / niceStepY) * niceStepY;
            }
        }

        if (drawLegend && legendOrientation === "Vertical" && !customYRange && (type === "Bar" || isStacked)) {
            maxY += niceStepY;
        }

        var totalYRange = maxY - minY;
        if (totalYRange <= 0) totalYRange = 1;

        var zeroPct = Math.min(Math.max((0 - minY) / totalYRange, 0), 1);
        var zeroScreenY = baseY - (zeroPct * h);
        var zeroScreenX = margin + (zeroPct * w);
        var xAxisScreenY = (xAxisPosMode === "Bottom of Graph") ? baseY : ((xAxisPosMode === "Custom Y Level") ? baseY - (((customXAxisLevel - minY) / totalYRange) * h) : zeroScreenY);

        var resolvedYDecimals = (yDecimalsOpt && yDecimalsOpt !== "Auto") ? parseInt(yDecimalsOpt, 10) : (niceStepY < 0.1 ? 3 : (niceStepY < 1 ? 2 : (niceStepY < 2 && niceStepY % 1 !== 0 ? 1 : 0)));
        var resolvedValDecimals = (valDecimalsOpt && valDecimalsOpt !== "Auto") ? parseInt(valDecimalsOpt, 10) : resolvedYDecimals;

        var minX = 0; var maxX = 0;
        if (isCategorical) { minX = 0; maxX = categories.length - 1; }
        else {
            var numCats = []; for (var n = 0; n < categories.length; n++) numCats.push(num(categories[n]));
            minX = Math.min.apply(null, numCats); maxX = Math.max.apply(null, numCats);
        }
        if (maxX === minX) maxX = minX + 1;

        function getLineX(cIdx) {
            if (isCategorical) {
                return (categories.length > 1) ? margin + (cIdx / (categories.length - 1)) * w : margin + (w / 2);
            }
            return margin + ((num(categories[cIdx]) - minX) / (maxX - minX)) * w;
        }

        var labelsToElevate = [];

        var ticksLayer = makeShapeLayer(comp, "Graph_Ticks_And_Gridlines");
        var ticksContents = safeProperty(ticksLayer, "ADBE Root Vectors Group", 2, "Contents");
        
        if (ticksContents) {
            var ticksGrp = ticksContents.addProperty("ADBE Vector Group");
            var ticksGrpContents = safeProperty(ticksGrp, "ADBE Vectors Group", 2, "Contents");

            function makeLineSegment(x1, y1, x2, y2, grpCont, indexName) {
                var lineSegment = grpCont.addProperty("ADBE Vector Shape - Group");
                if (lineSegment) {
                    lineSegment.name = indexName;
                    var pathObj = new Shape();
                    pathObj.vertices = [[x1, y1], [x2, y2]]; pathObj.closed = false;
                    var pathProp = safeProperty(lineSegment, "ADBE Vector Shape", 1, "Path");
                    if (pathProp) pathProp.setValue(pathObj);
                }
            }

            var isHorizontalBar = (type === "Bar" && barOrientation === "Horizontal");

            if (!isHorizontalBar) {
                var startYTick = Math.ceil(minY / niceStepY) * niceStepY;
                for (var valY = startYTick; valY <= maxY + (niceStepY * 0.001); valY += niceStepY) {
                    var yPct = (valY - minY) / totalYRange;
                    var tY = baseY - (yPct * h);
                    
                    if (drawYLabels) {
                        var formattedVal = formatNumber(valY, resolvedYDecimals, separatorSymbol, decSep);
                        var labelXPos = rightYAxis ? baseX + (currentFontSize * 0.7 + 5) : baseX - (currentFontSize * 0.7 + 5);
                        var labelJustify = rightYAxis ? "left" : "right";
                        var labelYPos = tY + (currentFontSize / 3);
                        var labelText = createText(comp, formattedVal, [labelXPos, labelYPos], labelJustify, "Y_Label_" + valY, currentFontSize);
                        labelsToElevate.push(labelText);
                        var op = safeProperty(labelText, "ADBE Transform Group", 3, "Transform");
                        if (op) {
                            var opProp = safeProperty(op, "ADBE Opacity", 11, "Opacity");
                            if (opProp) {
                                if (isAnimated && animateAxes) {
                                    opProp.setValueAtTime(0.8, 0); opProp.setValueAtTime(1.3, 100);
                                } else { opProp.setValue(100); }
                            }
                        }
                    }

                    if (ticksGrpContents) {
                        if (yTickStyle === "Full Grid") makeLineSegment(margin, tY, comp.width - margin, tY, ticksGrpContents, "Y_Grid_" + valY);
                        else if (yTickStyle === "Short Ticks") makeLineSegment(baseX + (rightYAxis ? 8 : -8), tY, baseX, tY, ticksGrpContents, "Y_Tick_" + valY);
                    }
                }
            } else {
                var startValTick = Math.ceil(minY / niceStepY) * niceStepY;
                for (var valXNum = startValTick; valXNum <= maxY + (niceStepY * 0.001); valXNum += niceStepY) {
                    var xPctH = (valXNum - minY) / totalYRange;
                    var tX = margin + (xPctH * w);
                    if (drawYLabels) {
                        var formattedHVal = formatNumber(valXNum, resolvedYDecimals, separatorSymbol, decSep);
                        var lblY = baseY + currentFontSize + 8;
                        var hTickText = createText(comp, formattedHVal, [tX, lblY], "center", "X_Num_Tick_" + valXNum, currentFontSize);
                        labelsToElevate.push(hTickText);
                    }
                    if (ticksGrpContents) {
                        if (yTickStyle === "Full Grid") makeLineSegment(tX, baseY, tX, baseY - h, ticksGrpContents, "Grid_H_" + valXNum);
                        else if (yTickStyle === "Short Ticks") makeLineSegment(tX, baseY, tX, baseY + 8, ticksGrpContents, "Tick_H_" + valXNum);
                    }
                }
            }

            if (type === "Bar" && !isHorizontalBar) {
                var singleCatW = w / categories.length;
                var labelSkipRatio = Math.ceil(categories.length / 10); 
                for (var c = 0; c < categories.length; c++) {
                    var cVal = categories[c];
                    var cX = margin + (c * singleCatW) + (singleCatW / 2);
                    
                    if (drawXLabels && (c % labelSkipRatio === 0 || c === categories.length - 1)) {
                        var labelYPos = baseY + currentFontSize + 8;
                        var xLabel = createText(comp, cVal.toString(), [cX, labelYPos], "center", "X_Label_" + cVal, currentFontSize);
                        labelsToElevate.push(xLabel);
                        var xOp = safeProperty(xLabel, "ADBE Transform Group", 3, "Transform");
                        if (xOp) {
                            var opProp = safeProperty(xOp, "ADBE Opacity", 11, "Opacity");
                            if (opProp) {
                                if (isAnimated && syncXLabelsPace) {
                                    var catDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                                    opProp.setValueAtTime(catDelay, 0); opProp.setValueAtTime(catDelay + (elemDuration * 0.5), 100);
                                } else if (isAnimated && animateAxes) {
                                    opProp.setValueAtTime(0.8, 0); opProp.setValueAtTime(1.3, 100);
                                } else { opProp.setValue(100); }
                            }
                        }
                    }

                    if (ticksGrpContents) {
                        if (xTickStyle === "Full Grid") makeLineSegment(cX, baseY, cX, baseY - h, ticksGrpContents, "X_Grid_" + c);
                        else if (xTickStyle === "Short Ticks") makeLineSegment(cX, xAxisScreenY, cX, xAxisScreenY + 8, ticksGrpContents, "X_Tick_" + c);
                    }
                }
            } else if (type === "Bar" && isHorizontalBar) {
                var singleCatH = h / categories.length;
                for (var ch = 0; ch < categories.length; ch++) {
                    var chVal = categories[ch];
                    var chY = (baseY - h) + (ch * singleCatH) + (singleCatH / 2);
                    if (drawXLabels) {
                        var catLblText = createText(comp, chVal.toString(), [margin - 12, chY + (currentFontSize * 0.35)], "right", "Cat_Label_" + chVal, currentFontSize);
                        labelsToElevate.push(catLblText);
                    }
                }
            } else {
                if (isCategorical) {
                    var labelSkipRatio = Math.ceil(categories.length / 10);
                    for (var c = 0; c < categories.length; c++) {
                        var cVal = categories[c];
                        var cX = getLineX(c);

                        if (drawXLabels && (c % labelSkipRatio === 0 || c === categories.length - 1)) {
                            var labelYPos = baseY + currentFontSize + 8;
                            var xLabel = createText(comp, cVal.toString(), [cX, labelYPos], "center", "X_Label_" + cVal, currentFontSize);
                            labelsToElevate.push(xLabel);
                            var xOp = safeProperty(xLabel, "ADBE Transform Group", 3, "Transform");
                            if (xOp) {
                                var opProp = safeProperty(xOp, "ADBE Opacity", 11, "Opacity");
                                if (opProp) {
                                    if (isAnimated && syncXLabelsPace) {
                                        var catDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                                        opProp.setValueAtTime(catDelay, 0); opProp.setValueAtTime(catDelay + (elemDuration * 0.5), 100);
                                    } else if (isAnimated && animateAxes) {
                                        opProp.setValueAtTime(0.8, 0); opProp.setValueAtTime(1.3, 100);
                                    } else { opProp.setValue(100); }
                                }
                            }
                        }

                        if (ticksGrpContents) {
                            if (xTickStyle === "Full Grid") makeLineSegment(cX, baseY, cX, baseY - h, ticksGrpContents, "X_Grid_" + c);
                            else if (xTickStyle === "Short Ticks") makeLineSegment(cX, xAxisScreenY, cX, xAxisScreenY + 8, ticksGrpContents, "X_Tick_" + c);
                        }
                    }
                } else {
                    var spanX = maxX - minX;
                    var niceStepX = getNiceStep(spanX, 5); 
                    var startValX = Math.ceil(minX / niceStepX) * niceStepX; 
                    var tIndex = 0;
                    var totalXTicks = Math.floor((maxX - startValX) / niceStepX) + 1;

                    for (var valX = startValX; valX <= maxX; valX += niceStepX) {
                        var xPct = (valX - minX) / spanX;
                        var cX = margin + (xPct * w);
                        if (drawXLabels) {
                            var labelYPos = baseY + currentFontSize + 8;
                            var xLabel = createText(comp, valX.toString(), [cX, labelYPos], "center", "X_Label_" + valX, currentFontSize);
                            labelsToElevate.push(xLabel);
                            var xOp = safeProperty(xLabel, "ADBE Transform Group", 3, "Transform");
                            if (xOp) {
                                var opProp = safeProperty(xOp, "ADBE Opacity", 11, "Opacity");
                                if (opProp) {
                                    if (isAnimated && syncXLabelsPace) {
                                        var tickDelay = (totalXTicks > 1) ? (tIndex / (totalXTicks - 1)) * staggerSpan : 0;
                                        opProp.setValueAtTime(tickDelay, 0); opProp.setValueAtTime(tickDelay + (elemDuration * 0.5), 100);
                                    } else if (isAnimated && animateAxes) {
                                        opProp.setValueAtTime(0.8, 0); opProp.setValueAtTime(1.3, 100);
                                    } else { opProp.setValue(100); }
                                }
                            }
                        }
                        if (ticksGrpContents) {
                            if (xTickStyle === "Full Grid") makeLineSegment(cX, baseY, cX, baseY - h, ticksGrpContents, "X_Grid_" + tIndex);
                            else if (xTickStyle === "Short Ticks") makeLineSegment(cX, xAxisScreenY, cX, xAxisScreenY + 8, ticksGrpContents, "X_Tick_" + tIndex);
                        }
                        tIndex++;
                    }
                }
            }

            if (ticksGrpContents && (xTickStyle !== "None" || yTickStyle !== "None")) {
                var stroke = ticksGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                if (stroke) {
                    safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color").setValue(resolvedGridColor);
                    safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(gridStrokeWidth);
                    safeProperty(stroke, "ADBE Vector Stroke Line Cap", 6, "Line Cap").setValue(3); 
                }
                if (isAnimated && animateAxes) {
                    var trim = ticksGrpContents.addProperty("ADBE Vector Filter - Trim");
                    if (trim) {
                        var trimEnd = safeProperty(trim, "ADBE Vector Trim End", 2, "End");
                        if (trimEnd) { trimEnd.setValueAtTime(0, 0); trimEnd.setValueAtTime(1.2, 100); }
                    }
                }
            }
        }

        if (type === "Bar" && barOrientation === "Horizontal") {
            var singleCatH = h / categories.length;
            var numSubGroups = subClusters.length > 0 ? subClusters.length : 1;
            var usableCatH = singleCatH * (1 - clusterGapPct);
            var clusterSlotH = usableCatH / numSubGroups;

            for (var c = 0; c < categories.length; c++) {
                var catTop = (baseY - h) + (c * singleCatH) + (singleCatH * clusterGapPct / 2);

                for (var scIdx = 0; scIdx < numSubGroups; scIdx++) {
                    var scKey = subClusters.length > 0 ? subClusters[scIdx] : "_default";
                    var clusterCenterY = catTop + (scIdx * clusterSlotH) + (clusterSlotH / 2);

                    if (subClusters.length > 0 && showSubLabels && drawXLabels) {
                        var subLabelY = clusterCenterY + (currentFontSize * 0.35);
                        var subLblLayer = createText(comp, scKey, [margin - 12, subLabelY], "right", "SubLabel_" + c + "_" + scIdx, currentFontSize * 0.7);
                        labelsToElevate.push(subLblLayer);
                    }

                    if (isStacked) {
                        var barThickness = clusterSlotH * barWidthPct;
                        var prevPosBarLayer = null;
                        var prevNegBarLayer = null;
                        var stackSumAccumulatorPos = 0;
                        var stackSumAccumulatorNeg = 0;

                        for (var g = 0; g < groupNames.length; g++) {
                            var seriesName = groupNames[g];
                            var val = (stackTable[c] && stackTable[c][scKey]) ? (stackTable[c][scKey][g] || 0) : 0;
                            var barLen = (Math.abs(val) / totalYRange) * w;
                            if (barLen <= 0) barLen = 2;
                            var isPos = (val >= 0);
                            if (isPos) stackSumAccumulatorPos += val; else stackSumAccumulatorNeg += val;

                            var seriesColorObj = CONFIG.activeSeriesColors[seriesName] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                            var barName = seriesName + "_HBar_Cat" + c + "_Sub" + scIdx;
                            var bar = makeShapeLayer(comp, barName);

                            var wSliderGrp = bar.effect.addProperty("ADBE Slider Control");
                            wSliderGrp.name = "Segment Width";
                            var wSliderProp = wSliderGrp.property(1);

                            var catDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                            var seriesDelay = (groupNames.length > 1) ? (g / groupNames.length) * (elemDuration * 0.2) : 0;
                            var staggerDelay = catDelay + seriesDelay;

                            if (isAnimated) {
                                wSliderProp.setValueAtTime(staggerDelay, 0);
                                wSliderProp.setValueAtTime(staggerDelay + elemDuration, barLen);
                                try {
                                    var easeOut = new KeyframeEase(0, 33);
                                    var easeIn = new KeyframeEase(0, 33);
                                    wSliderProp.setTemporalEaseAtKey(1, [easeOut], [easeIn]);
                                    wSliderProp.setTemporalEaseAtKey(2, [easeOut], [easeIn]);
                                } catch(eEaseH) {}
                            } else {
                                wSliderProp.setValue(barLen);
                            }

                            var trans = safeProperty(bar, "ADBE Transform Group", 3, "Transform");
                            if (trans) {
                                var posProp = safeProperty(trans, "ADBE Position", 2, "Position");
                                if (posProp) {
                                    if (isPos) {
                                        if (prevPosBarLayer === null) {
                                            posProp.setValue([zeroScreenX, clusterCenterY]);
                                        } else {
                                            posProp.setValue([zeroScreenX, clusterCenterY]);
                                            posProp.expression = 'var prev = thisComp.layer("' + prevPosBarLayer.name + '");\n' +
                                                                'var prevW = prev.effect("Segment Width")(1);\n' +
                                                                '[prev.transform.position[0] + prevW, value[1]];';
                                        }
                                    } else {
                                        if (prevNegBarLayer === null) {
                                            posProp.setValue([zeroScreenX, clusterCenterY]);
                                        } else {
                                            posProp.setValue([zeroScreenX, clusterCenterY]);
                                            posProp.expression = 'var prev = thisComp.layer("' + prevNegBarLayer.name + '");\n' +
                                                                'var prevW = prev.effect("Segment Width")(1);\n' +
                                                                '[prev.transform.position[0] - prevW, value[1]];';
                                        }
                                    }
                                }
                            }

                            var contents = safeProperty(bar, "ADBE Root Vectors Group", 2, "Contents");
                            if (contents) {
                                var fillGrp = contents.addProperty("ADBE Vector Group");
                                fillGrp.name = "Fill_Group";
                                var fillGrpContents = safeProperty(fillGrp, "ADBE Vectors Group", 2, "Contents");
                                if (fillGrpContents) {
                                    var rect = fillGrpContents.addProperty("ADBE Vector Shape - Rect");
                                    rect.name = "Rect_Path";
                                    var sizeProp = safeProperty(rect, "ADBE Vector Rect Size", 1, "Size");
                                    if (sizeProp) {
                                        sizeProp.setValue([barLen, barThickness]);
                                        sizeProp.expression = 'var w = effect("Segment Width")(1);\n[w, ' + barThickness + '];';
                                    }
                                    var rectPos = safeProperty(rect, "ADBE Vector Rect Position", 2, "Position");
                                    if (rectPos) {
                                        var offsetExpr = isPos ? 'var w = effect("Segment Width")(1);\n[w/2, 0];' : 'var w = effect("Segment Width")(1);\n[-w/2, 0];';
                                        rectPos.setValue([isPos ? barLen / 2 : -barLen / 2, 0]);
                                        rectPos.expression = offsetExpr;
                                    }
                                    if (fillBars) {
                                        var fill = fillGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                        if (fill) safeProperty(fill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.fill);
                                    }
                                    if (strokeBars) {
                                        var stroke = fillGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                        if (stroke) {
                                            safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                            safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                        }
                                    }
                                }
                            }

                            if (drawValues && val !== 0) {
                                var valTextString = formatNumber(val, resolvedValDecimals, separatorSymbol, decSep);
                                var valText = createText(comp, valTextString, [zeroScreenX, clusterCenterY], "center", "Val_" + barName, currentFontSize);
                                labelsToElevate.push(valText);
                                var vTrans = safeProperty(valText, "ADBE Transform Group", 3, "Transform");
                                if (vTrans) {
                                    var vPos = safeProperty(vTrans, "ADBE Position", 2, "Position");
                                    if (vPos) {
                                        var isCentered = (valueLabelPos === "Center of Bar");
                                        if (isCentered) {
                                            var cExpr = isPos
                                                ? 'var pBar = thisComp.layer("' + barName + '");\nvar w = pBar.effect("Segment Width")(1);\n[pBar.transform.position[0] + (w / 2), pBar.transform.position[1] + (' + (currentFontSize * 0.35) + ')];'
                                                : 'var pBar = thisComp.layer("' + barName + '");\nvar w = pBar.effect("Segment Width")(1);\n[pBar.transform.position[0] - (w / 2), pBar.transform.position[1] + (' + (currentFontSize * 0.35) + ')];';
                                            vPos.expression = cExpr;
                                        } else {
                                            var oExpr = isPos
                                                ? 'var pBar = thisComp.layer("' + barName + '");\nvar w = pBar.effect("Segment Width")(1);\n[pBar.transform.position[0] + w + 8, pBar.transform.position[1] + (' + (currentFontSize * 0.35) + ')];'
                                                : 'var pBar = thisComp.layer("' + barName + '");\nvar w = pBar.effect("Segment Width")(1);\n[pBar.transform.position[0] - w - 8, pBar.transform.position[1] + (' + (currentFontSize * 0.35) + ')];';
                                            vPos.expression = oExpr;
                                        }
                                    }
                                    var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                                    if (vOp) {
                                        if (isAnimated) {
                                            vOp.setValueAtTime(staggerDelay + (elemDuration * 0.4), 0);
                                            vOp.setValueAtTime(staggerDelay + elemDuration, 100);
                                        } else { vOp.setValue(100); }
                                    }
                                }
                            }

                            if (isPos) prevPosBarLayer = bar; else prevNegBarLayer = bar;
                        }

                        if (drawTotalSum && (prevPosBarLayer || prevNegBarLayer)) {
                            if (prevPosBarLayer && stackSumAccumulatorPos > 0) {
                                var totalStrP = formatNumber(stackSumAccumulatorPos, resolvedValDecimals, separatorSymbol, decSep);
                                var totalTextP = createText(comp, totalStrP, [zeroScreenX, clusterCenterY], "left", "Total_Sum_Pos_" + c + "_" + scIdx, currentFontSize);
                                labelsToElevate.push(totalTextP);
                                var ttTransP = safeProperty(totalTextP, "ADBE Transform Group", 3, "Transform");
                                if (ttTransP) {
                                    var ttPosP = safeProperty(ttTransP, "ADBE Position", 2, "Position");
                                    if (ttPosP) {
                                        ttPosP.expression = 'var rightBar = thisComp.layer("' + prevPosBarLayer.name + '");\n' +
                                                           'var w = rightBar.effect("Segment Width")(1);\n' +
                                                           '[rightBar.transform.position[0] + w + 8, rightBar.transform.position[1] + (' + (currentFontSize * 0.35) + ')];';
                                    }
                                    var ttOpP = safeProperty(ttTransP, "ADBE Opacity", 11, "Opacity");
                                    if (ttOpP) {
                                        if (isAnimated) {
                                            ttOpP.setValueAtTime(totDuration * 0.6, 0);
                                            ttOpP.setValueAtTime(totDuration, 100);
                                        } else { ttOpP.setValue(100); }
                                    }
                                }
                            }
                            if (prevNegBarLayer && stackSumAccumulatorNeg < 0) {
                                var totalStrN = formatNumber(stackSumAccumulatorNeg, resolvedValDecimals, separatorSymbol, decSep);
                                var totalTextN = createText(comp, totalStrN, [zeroScreenX, clusterCenterY], "right", "Total_Sum_Neg_" + c + "_" + scIdx, currentFontSize);
                                labelsToElevate.push(totalTextN);
                                var ttTransN = safeProperty(totalTextN, "ADBE Transform Group", 3, "Transform");
                                if (ttTransN) {
                                    var ttPosN = safeProperty(ttTransN, "ADBE Position", 2, "Position");
                                    if (ttPosN) {
                                        ttPosN.expression = 'var leftBar = thisComp.layer("' + prevNegBarLayer.name + '");\n' +
                                                           'var w = leftBar.effect("Segment Width")(1);\n' +
                                                           '[leftBar.transform.position[0] - w - 8, leftBar.transform.position[1] + (' + (currentFontSize * 0.35) + ')];';
                                    }
                                    var ttOpN = safeProperty(ttTransN, "ADBE Opacity", 11, "Opacity");
                                    if (ttOpN) {
                                        if (isAnimated) {
                                            ttOpN.setValueAtTime(totDuration * 0.6, 0);
                                            ttOpN.setValueAtTime(totDuration, 100);
                                        } else { ttOpN.setValue(100); }
                                    }
                                }
                            }
                        }
                    } else {
                        var usableHeight = clusterSlotH * (1 - clusterGapPct);
                        var barThickness = (usableHeight * barWidthPct) / groupNames.length;
                        var groupSpacing = groupNames.length > 1 ? (usableHeight * (1 - barWidthPct)) / (groupNames.length - 1) : 0;

                        for (var g = 0; g < groupNames.length; g++) {
                            var seriesName = groupNames[g];
                            var val = (stackTable[c] && stackTable[c][scKey]) ? (stackTable[c][scKey][g] || 0) : 0;
                            var py = (clusterCenterY - (usableHeight / 2)) + (g * (barThickness + groupSpacing)) + (barThickness / 2);
                            var barLen = (Math.abs(val) / totalYRange) * w;
                            if (barLen <= 0) barLen = 2;
                            var dir = (val >= 0) ? 1 : -1;

                            var seriesColorObj = CONFIG.activeSeriesColors[seriesName] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                            var barName = seriesName + "_HBar_Cat" + c + "_Sub" + scIdx;
                            var bar = makeShapeLayer(comp, barName);
                            var trans = safeProperty(bar, "ADBE Transform Group", 3, "Transform");
                            if (trans) safeProperty(trans, "ADBE Position", 2, "Position").setValue([zeroScreenX, py]);

                            var contents = safeProperty(bar, "ADBE Root Vectors Group", 2, "Contents");
                            if (contents) {
                                var fillGrp = contents.addProperty("ADBE Vector Group");
                                fillGrp.name = "Fill_Group";
                                var fillGrpTrans = safeProperty(fillGrp, "ADBE Vector Transform Group", 3, "Transform");
                                if (fillGrpTrans) {
                                    var fillGrpScale = safeProperty(fillGrpTrans, "ADBE Vector Scale", 3, "Scale");
                                    if (fillGrpScale) {
                                        var catDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                                        var seriesDelay = (groupNames.length > 1) ? (g / groupNames.length) * (elemDuration * 0.2) : 0;
                                        var staggerDelay = catDelay + seriesDelay;
                                        if (isAnimated) {
                                            fillGrpScale.setValueAtTime(staggerDelay, [0, 100]);
                                            fillGrpScale.setValueAtTime(staggerDelay + elemDuration, [100, 100]);
                                        } else { fillGrpScale.setValue([100, 100]); }
                                    }
                                }
                                var fillGrpContents = safeProperty(fillGrp, "ADBE Vectors Group", 2, "Contents");
                                if (fillGrpContents) {
                                    var rect = fillGrpContents.addProperty("ADBE Vector Shape - Rect");
                                    safeProperty(rect, "ADBE Vector Rect Size", 1, "Size").setValue([barLen, barThickness]);
                                    safeProperty(rect, "ADBE Vector Rect Position", 2, "Position").setValue([dir * (barLen / 2), 0]);
                                    if (fillBars) {
                                        var fill = fillGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                        if (fill) safeProperty(fill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.fill);
                                    }
                                    if (strokeBars) {
                                        var stroke = fillGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                        if (stroke) {
                                            safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                            safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                        }
                                    }
                                }
                            }

                            if (drawValues && val !== 0) {
                                var isCentered = (valueLabelPos === "Center of Bar");
                                var vPosCenterX = isCentered ? zeroScreenX + (dir * (barLen / 2)) : zeroScreenX + (dir * barLen) + (dir * 8);
                                var vJust = isCentered ? "center" : (dir >= 0 ? "left" : "right");
                                var labelTextString = formatNumber(val, resolvedValDecimals, separatorSymbol, decSep);
                                var valText = createText(comp, labelTextString, [vPosCenterX, py + (currentFontSize * 0.35)], vJust, "Val_" + barName, currentFontSize);
                                labelsToElevate.push(valText);
                                var vTrans = safeProperty(valText, "ADBE Transform Group", 3, "Transform");
                                if (vTrans) {
                                    var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                                    if (vOp) {
                                        if (isAnimated) {
                                            vOp.setValueAtTime(staggerDelay + (elemDuration * 0.5), 0);
                                            vOp.setValueAtTime(staggerDelay + elemDuration, 100);
                                        } else { vOp.setValue(100); }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if (type === "Bar") {
            var singleCatW = w / categories.length;
            var numSubGroups = subClusters.length > 0 ? subClusters.length : 1;
            var usableCatWidth = singleCatW * (1 - clusterGapPct);
            var clusterSlotW = usableCatWidth / numSubGroups;

            for (var c = 0; c < categories.length; c++) {
                var catLeft = margin + (c * singleCatW) + (singleCatW * clusterGapPct / 2);

                for (var scIdx = 0; scIdx < numSubGroups; scIdx++) {
                    var scKey = subClusters.length > 0 ? subClusters[scIdx] : "_default";
                    var clusterCenterX = catLeft + (scIdx * clusterSlotW) + (clusterSlotW / 2);

                    if (subClusters.length > 0 && showSubLabels && drawXLabels) {
                        var subLabelY = baseY + (currentFontSize * 2.2) + 2;
                        var subLblLayer = createText(comp, scKey, [clusterCenterX, subLabelY], "center", "SubLabel_" + c + "_" + scIdx, currentFontSize * 0.7);
                        labelsToElevate.push(subLblLayer);
                    }

                    if (isStacked) {
                        var barW = clusterSlotW * barWidthPct;
                        var prevBarLayer = null;
                        var stackSumAccumulator = 0;

                        for (var g = 0; g < groupNames.length; g++) {
                            var seriesName = groupNames[g];
                            var val = (stackTable[c] && stackTable[c][scKey]) ? (stackTable[c][scKey][g] || 0) : 0;
                            var hVal = (Math.abs(val) / totalYRange) * h;
                            if (hVal <= 0) hVal = 2;
                            stackSumAccumulator += val;

                            var seriesColorObj = CONFIG.activeSeriesColors[seriesName] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                            var barName = seriesName + "_Bar_Cat" + c + "_Sub" + scIdx;
                            var bar = makeShapeLayer(comp, barName);

                            var hSliderGrp = bar.effect.addProperty("ADBE Slider Control");
                            hSliderGrp.name = "Segment Height";
                            var hSliderProp = hSliderGrp.property(1);

                            var catDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                            var seriesDelay = (groupNames.length > 1) ? (g / groupNames.length) * (elemDuration * 0.2) : 0;
                            var staggerDelay = catDelay + seriesDelay;

                            if (isAnimated) {
                                hSliderProp.setValueAtTime(staggerDelay, 0);
                                hSliderProp.setValueAtTime(staggerDelay + elemDuration, hVal);
                                try {
                                    var easeOut = new KeyframeEase(0, 33);
                                    var easeIn = new KeyframeEase(0, 33);
                                    hSliderProp.setTemporalEaseAtKey(1, [easeOut], [easeIn]);
                                    hSliderProp.setTemporalEaseAtKey(2, [easeOut], [easeIn]);
                                } catch(eEase) {}
                            } else {
                                hSliderProp.setValue(hVal);
                            }

                            var trans = safeProperty(bar, "ADBE Transform Group", 3, "Transform");
                            if (trans) {
                                var posProp = safeProperty(trans, "ADBE Position", 2, "Position");
                                if (posProp) {
                                    if (prevBarLayer === null) {
                                        posProp.setValue([clusterCenterX, baseY]);
                                    } else {
                                        posProp.setValue([clusterCenterX, baseY]);
                                        posProp.expression = 'var prev = thisComp.layer("' + prevBarLayer.name + '");\n' +
                                                            'var prevH = prev.effect("Segment Height")(1);\n' +
                                                            '[value[0], prev.transform.position[1] - prevH];';
                                    }
                                }
                            }

                            var contents = safeProperty(bar, "ADBE Root Vectors Group", 2, "Contents");
                            if (contents) {
                                var fillGrp = contents.addProperty("ADBE Vector Group");
                                fillGrp.name = "Fill_Group";
                                var fillGrpContents = safeProperty(fillGrp, "ADBE Vectors Group", 2, "Contents");
                                if (fillGrpContents) {
                                    var rect = fillGrpContents.addProperty("ADBE Vector Shape - Rect");
                                    rect.name = "Rect_Path";
                                    var sizeProp = safeProperty(rect, "ADBE Vector Rect Size", 1, "Size");
                                    if (sizeProp) {
                                        sizeProp.setValue([barW, hVal]);
                                        sizeProp.expression = 'var h = effect("Segment Height")(1);\n[' + barW + ', h];';
                                    }
                                    var rectPos = safeProperty(rect, "ADBE Vector Rect Position", 2, "Position");
                                    if (rectPos) {
                                        rectPos.setValue([0, -hVal / 2]);
                                        rectPos.expression = 'var h = effect("Segment Height")(1);\n[0, -h/2];';
                                    }
                                    if (fillBars) {
                                        var fill = fillGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                        if (fill) safeProperty(fill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.fill);
                                    }
                                    if (strokeBars) {
                                        var stroke = fillGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                        if (stroke) {
                                            safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                            safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                        }
                                    }
                                }
                            }

                            if (drawValues && val !== 0) {
                                var valTextString = formatNumber(val, resolvedValDecimals, separatorSymbol, decSep);
                                var valText = createText(comp, valTextString, [clusterCenterX, baseY], "center", "Val_" + barName, currentFontSize);
                                labelsToElevate.push(valText);
                                var vTrans = safeProperty(valText, "ADBE Transform Group", 3, "Transform");
                                if (vTrans) {
                                    var vPos = safeProperty(vTrans, "ADBE Position", 2, "Position");
                                    if (vPos) {
                                        var isCentered = (valueLabelPos === "Center of Bar");
                                        if (isCentered) {
                                            vPos.expression = 'var pBar = thisComp.layer("' + barName + '");\n' +
                                                              'var h = pBar.effect("Segment Height")(1);\n' +
                                                              '[pBar.transform.position[0], pBar.transform.position[1] - (h / 2) + (' + (currentFontSize * 0.3) + ')];';
                                        } else {
                                            vPos.expression = 'var pBar = thisComp.layer("' + barName + '");\n' +
                                                              'var h = pBar.effect("Segment Height")(1);\n' +
                                                              '[pBar.transform.position[0], pBar.transform.position[1] - h - (' + (currentFontSize * 0.6) + ')];';
                                        }
                                    }
                                    var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                                    if (vOp) {
                                        if (isAnimated) {
                                            vOp.setValueAtTime(staggerDelay + (elemDuration * 0.4), 0);
                                            vOp.setValueAtTime(staggerDelay + elemDuration, 100);
                                        } else { vOp.setValue(100); }
                                    }
                                }
                            }

                            prevBarLayer = bar;
                        }

                        if (drawTotalSum && prevBarLayer && stackSumAccumulator > 0) {
                            var totalStr = formatNumber(stackSumAccumulator, resolvedValDecimals, separatorSymbol, decSep);
                            var totalText = createText(comp, totalStr, [clusterCenterX, baseY], "center", "Total_Sum_" + c + "_" + scIdx, currentFontSize);
                            labelsToElevate.push(totalText);
                            var ttTrans = safeProperty(totalText, "ADBE Transform Group", 3, "Transform");
                            if (ttTrans) {
                                var ttPos = safeProperty(ttTrans, "ADBE Position", 2, "Position");
                                if (ttPos) {
                                    ttPos.expression = 'var topBar = thisComp.layer("' + prevBarLayer.name + '");\n' +
                                                       'var h = topBar.effect("Segment Height")(1);\n' +
                                                       '[topBar.transform.position[0], topBar.transform.position[1] - h - (' + (currentFontSize * 0.6) + ')];';
                                }
                                var ttOp = safeProperty(ttTrans, "ADBE Opacity", 11, "Opacity");
                                if (ttOp) {
                                    if (isAnimated) {
                                        ttOp.setValueAtTime(totDuration * 0.6, 0);
                                        ttOp.setValueAtTime(totDuration, 100);
                                    } else { ttOp.setValue(100); }
                                }
                            }
                        }
                    } else {
                        var usableWidth = clusterSlotW * (1 - clusterGapPct); 
                        var barW = (usableWidth * barWidthPct) / groupNames.length;
                        var groupSpacing = groupNames.length > 1 ? (usableWidth * (1 - barWidthPct)) / (groupNames.length - 1) : 0;

                        for (var g = 0; g < groupNames.length; g++) {
                            var seriesName = groupNames[g];
                            var val = (stackTable[c] && stackTable[c][scKey]) ? (stackTable[c][scKey][g] || 0) : 0;
                            var px = (clusterCenterX - (usableWidth / 2)) + (g * (barW + groupSpacing)) + (barW / 2);
                            var hVal = (Math.abs(val) / totalYRange) * h;
                            if (hVal <= 0) hVal = 2;

                            var seriesColorObj = CONFIG.activeSeriesColors[seriesName] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                            var barName = seriesName + "_Bar_Cat" + c + "_Sub" + scIdx;
                            var bar = makeShapeLayer(comp, barName);
                            var trans = safeProperty(bar, "ADBE Transform Group", 3, "Transform");
                            if (trans) safeProperty(trans, "ADBE Position", 2, "Position").setValue([px, zeroScreenY]);

                            var contents = safeProperty(bar, "ADBE Root Vectors Group", 2, "Contents");
                            if (contents) {
                                var fillGrp = contents.addProperty("ADBE Vector Group");
                                fillGrp.name = "Fill_Group";
                                var fillGrpTrans = safeProperty(fillGrp, "ADBE Vector Transform Group", 3, "Transform");
                                if (fillGrpTrans) {
                                    var fillGrpScale = safeProperty(fillGrpTrans, "ADBE Vector Scale", 3, "Scale");
                                    if (fillGrpScale) {
                                        var catDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                                        var seriesDelay = (groupNames.length > 1) ? (g / groupNames.length) * (elemDuration * 0.2) : 0;
                                        var staggerDelay = catDelay + seriesDelay;
                                        if (isAnimated) {
                                            fillGrpScale.setValueAtTime(staggerDelay, [100, 0]);
                                            fillGrpScale.setValueAtTime(staggerDelay + elemDuration, [100, 100]);
                                        } else { fillGrpScale.setValue([100, 100]); }
                                    }
                                }
                                var fillGrpContents = safeProperty(fillGrp, "ADBE Vectors Group", 2, "Contents");
                                if (fillGrpContents) {
                                    var rect = fillGrpContents.addProperty("ADBE Vector Shape - Rect");
                                    safeProperty(rect, "ADBE Vector Rect Size", 1, "Size").setValue([barW, hVal]);
                                    var dir = (val >= 0) ? -1 : 1;
                                    safeProperty(rect, "ADBE Vector Rect Position", 2, "Position").setValue([0, dir * (hVal / 2)]);
                                    if (fillBars) {
                                        var fill = fillGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                        if (fill) safeProperty(fill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.fill);
                                    }
                                    if (strokeBars) {
                                        var stroke = fillGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                        if (stroke) {
                                            safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                            safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                        }
                                    }
                                }
                            }

                            if (drawValues && val !== 0) {
                                var isCentered = (valueLabelPos === "Center of Bar");
                                var dir = (val >= 0) ? -1 : 1;
                                var valueYPos = zeroScreenY + (dir * hVal) + (dir * (currentFontSize * 0.5 + 4));
                                if (isCentered) valueYPos = zeroScreenY + (dir * (hVal / 2)) + (currentFontSize / 4);
                                var labelTextString = formatNumber(val, resolvedValDecimals, separatorSymbol, decSep);
                                var valText = createText(comp, labelTextString, [px, valueYPos], "center", "Val_" + barName, currentFontSize);
                                labelsToElevate.push(valText);
                                var vTrans = safeProperty(valText, "ADBE Transform Group", 3, "Transform");
                                if (vTrans) {
                                    var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                                    if (vOp) {
                                        if (isAnimated) {
                                            vOp.setValueAtTime(staggerDelay + (elemDuration * 0.5), 0);
                                            vOp.setValueAtTime(staggerDelay + elemDuration, 100);
                                        } else { vOp.setValue(100); }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            for (var gIdx = 0; gIdx < groupNames.length; gIdx++) {
                var name = groupNames[gIdx];
                if (!series[name]) continue;

                var seriesColorObj = CONFIG.activeSeriesColors[name] || { fill: CONFIG.defaultFillPalette[gIdx % 6], stroke: CONFIG.defaultStrokePalette[gIdx % 6] };
                var lineLayer = makeShapeLayer(comp, name + "_Line_Group");
                var lineContents = safeProperty(lineLayer, "ADBE Root Vectors Group", 2, "Contents");

                var shapeVerts = [];
                var baselineVerts = [];

                for (var c = 0; c < categories.length; c++) {
                    var px = getLineX(c);
                    var priorSum = 0;
                    var currentVal = 0;

                    if (stackTable[c]) {
                        var targetSub = "_default";
                        for (var kSub in stackTable[c]) { targetSub = kSub; break; }
                        var subArr = stackTable[c][targetSub];
                        if (subArr) {
                            currentVal = subArr[gIdx] || 0;
                            if (isStacked) {
                                for (var pre = 0; pre < gIdx; pre++) {
                                    priorSum += subArr[pre] || 0;
                                }
                            }
                        }
                    }

                    var cumulativeYVal = currentVal + priorSum;
                    var yPct = (cumulativeYVal - minY) / totalYRange;
                    var basePct = (priorSum - minY) / totalYRange;

                    var py = baseY - (yPct * h);
                    var pBaseY = baseY - (basePct * h);

                    shapeVerts.push([px, py]);
                    baselineVerts.push([px, isStacked ? pBaseY : zeroScreenY]);

                    if (dots) {
                        var dot = makeShapeLayer(comp, name + "_Dot_" + c); 
                        var dTrans = safeProperty(dot, "ADBE Transform Group", 3, "Transform");
                        if (dTrans) safeProperty(dTrans, "ADBE Position", 2, "Position").setValue([px, py]);

                        var dotContents = safeProperty(dot, "ADBE Root Vectors Group", 2, "Contents");
                        if (dotContents) {
                            var dotGrp = dotContents.addProperty("ADBE Vector Group");
                            var dotGrpContents = safeProperty(dotGrp, "ADBE Vectors Group", 2, "Contents");
                            if (dotGrpContents) {
                                var circle = dotGrpContents.addProperty("ADBE Vector Shape - Ellipse");
                                if (circle) {
                                    var dotDimension = currentStrokeWidth * 2.5 + 4;
                                    safeProperty(circle, "ADBE Vector Ellipse Size", 1, "Size").setValue([dotDimension, dotDimension]);
                                }
                                var dotFill = dotGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                if (dotFill) safeProperty(dotFill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.stroke);
                            }
                        }

                        if (dTrans) {
                            var dotScale = safeProperty(dTrans, "ADBE Scale", 3, "Scale");
                            if (dotScale) {
                                if (isAnimated) {
                                    var dotDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                                    dotScale.setValueAtTime(dotDelay, [0, 0, 100]);
                                    dotScale.setValueAtTime(dotDelay + (elemDuration * 0.4), [100, 100, 100]);
                                } else { dotScale.setValue([100, 100, 100]); }
                            }
                        }
                    }

                    if (drawValues && currentVal !== 0) {
                        var isCentered = (valueLabelPos === "Center of Bar");
                        var valueYPos = py - (dots ? currentFontSize * 0.8 + 4 : currentFontSize * 0.6);
                        if (isStacked && isCentered) valueYPos = py + ((pBaseY - py) / 2) + (currentFontSize * 0.3);
                        var labelTextString = formatNumber(currentVal, resolvedValDecimals, separatorSymbol, decSep);
                        var lValText = createText(comp, labelTextString, [px, valueYPos], "center", "Val_Node_" + name + "_" + c, currentFontSize);
                        labelsToElevate.push(lValText);
                        var lvTrans = safeProperty(lValText, "ADBE Transform Group", 3, "Transform");
                        if (lvTrans) {
                            var lvOp = safeProperty(lvTrans, "ADBE Opacity", 11, "Opacity");
                            if (lvOp) {
                                if (isAnimated) {
                                    var lDelay = (categories.length > 1) ? (c / (categories.length - 1)) * staggerSpan : 0;
                                    lvOp.setValueAtTime(lDelay + (elemDuration * 0.3), 0);
                                    lvOp.setValueAtTime(lDelay + (elemDuration * 0.7), 100);
                                } else { lvOp.setValue(100); }
                            }
                        }
                    }
                }

                if (lineContents) {
                    if (fillLines && shapeVerts.length > 0) {
                        var areaGrp = lineContents.addProperty("ADBE Vector Group");
                        areaGrp.name = "Area_Fill_Group";
                        var areaGrpContents = safeProperty(areaGrp, "ADBE Vectors Group", 2, "Contents");
                        if (areaGrpContents) {
                            var areaShape = areaGrpContents.addProperty("ADBE Vector Shape - Group");
                            var areaMyShape = new Shape();
                            var areaVerts = [];

                            for (var v = 0; v < shapeVerts.length; v++) areaVerts.push(shapeVerts[v]);
                            for (var v = baselineVerts.length - 1; v >= 0; v--) areaVerts.push(baselineVerts[v]);

                            areaMyShape.vertices = areaVerts;
                            areaMyShape.closed = true;
                            if (areaShape) {
                                var aPathProp = safeProperty(areaShape, "ADBE Vector Shape", 1, "Path");
                                if (aPathProp) aPathProp.setValue(areaMyShape);
                            }

                            var areaFill = areaGrpContents.addProperty("ADBE Vector Graphic - Fill");
                            if (areaFill) {
                                safeProperty(areaFill, "ADBE Vector Fill Color", 4, "Color").setValue((customFill || !strokeLines) ? seriesColorObj.fill : seriesColorObj.stroke);
                            }
                            
                            var areaTrans = safeProperty(areaGrp, "ADBE Vector Transform Group", 3, "Transform");
                            if (areaTrans) {
                                var areaOp = safeProperty(areaTrans, "ADBE Vector Group Opacity", 7, "Opacity");
                                if (!areaOp) areaOp = safeProperty(areaTrans, "ADBE Vector Opacity", 7, "Opacity");
                                if (areaOp) {
                                    var areaOpacityValue = isNaN(customFillOpacity) ? 30 : Math.min(Math.max(customFillOpacity, 0), 100);
                                    if (isAnimated) {
                                        areaOp.setValueAtTime(0, 0);
                                        areaOp.setValueAtTime(totDuration, areaOpacityValue);
                                    } else { areaOp.setValue(areaOpacityValue); }
                                }
                            }
                        }
                    }

                    if (strokeLines && shapeVerts.length > 0) {
                        var strokeGrp = lineContents.addProperty("ADBE Vector Group");
                        strokeGrp.name = "Stroke_Line_Group";
                        var strokeGrpContents = safeProperty(strokeGrp, "ADBE Vectors Group", 2, "Contents");
                        if (strokeGrpContents) {
                            var lineShape = strokeGrpContents.addProperty("ADBE Vector Shape - Group");
                            var myShape = new Shape();
                            myShape.vertices = shapeVerts;
                            myShape.closed = false;
                            if (lineShape) {
                                var lPathProp = safeProperty(lineShape, "ADBE Vector Shape", 1, "Path");
                                if (lPathProp) lPathProp.setValue(myShape);
                            }

                            var lineStroke = strokeGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                            if (lineStroke) {
                                safeProperty(lineStroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                safeProperty(lineStroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth); 
                            }

                            if (isAnimated) {
                                var trim = strokeGrpContents.addProperty("ADBE Vector Filter - Trim");
                                if (trim) {
                                    var trimEnd = safeProperty(trim, "ADBE Vector Trim End", 2, "End");
                                    if (trimEnd) {
                                        trimEnd.setValueAtTime(0, 0);
                                        trimEnd.setValueAtTime(totDuration, 100);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (isStacked && drawTotalSum && categories.length > 0) {
                for (var cSum = 0; cSum < categories.length; cSum++) {
                    var totalAtCat = 0;
                    var catData = stackTable[cSum];
                    if (catData) {
                        for (var sK in catData) {
                            for (var gK = 0; gK < groupNames.length; gK++) totalAtCat += catData[sK][gK] || 0;
                            break;
                        }
                    }
                    if (totalAtCat > 0) {
                        var pxSum = getLineX(cSum);
                        var pySum = baseY - (((totalAtCat - minY) / totalYRange) * h) - (currentFontSize * 0.7);
                        var totalStr = formatNumber(totalAtCat, resolvedValDecimals, separatorSymbol, decSep);
                        var totalLayer = createText(comp, totalStr, [pxSum, pySum], "center", "Total_Sum_Area_" + cSum, currentFontSize);
                        labelsToElevate.push(totalLayer);
                        var tTrans = safeProperty(totalLayer, "ADBE Transform Group", 3, "Transform");
                        if (tTrans) {
                            var tOp = safeProperty(tTrans, "ADBE Opacity", 11, "Opacity");
                            if (tOp) {
                                if (isAnimated) {
                                    tOp.setValueAtTime(totDuration * 0.6, 0);
                                    tOp.setValueAtTime(totDuration, 100);
                                } else { tOp.setValue(100); }
                            }
                        }
                    }
                }
            }
        }

        var axisLayer = null;
        if (drawXAxis || drawYAxis) {
            axisLayer = drawAxis(comp, baseX, xAxisScreenY, w, h, axisStrokeWidth, animateAxes, drawXAxis, drawYAxis, rightYAxis, baseY);
            if (axisLayer) axisLayer.moveToBeginning();
        }

        if (drawRefLine && refLineVal !== "") {
            var refLayer = makeShapeLayer(comp, "Ref_Line_" + refLineVal);
            var refContents = safeProperty(refLayer, "ADBE Root Vectors Group", 2, "Contents");
            if (refContents) {
                var isRefY = (refLineAxis && refLineAxis.indexOf("Y-Axis") !== -1);
                var x1 = margin, y1 = baseY, x2 = margin, y2 = baseY;

                if (isRefY) {
                    var targetYNum = num(refLineVal);
                    var refYPct = (targetYNum - minY) / totalYRange;
                    var refScreenY = baseY - (refYPct * h);
                    x1 = margin;
                    x2 = comp.width - margin;
                    y1 = y2 = refScreenY;
                } else {
                    var refValTrim = refLineVal.replace(/^\s+|\s+$/g, '');
                    var foundCatIdx = -1;
                    for (var rC = 0; rC < categories.length; rC++) {
                        if (categories[rC] === refValTrim) {
                            foundCatIdx = rC;
                            break;
                        }
                    }
                    var refScreenX = margin;
                    if (foundCatIdx !== -1) {
                        refScreenX = (type === "Bar") 
                            ? margin + (foundCatIdx * (w / categories.length)) + ((w / categories.length) / 2)
                            : getLineX(foundCatIdx);
                    } else if (isNumeric(refValTrim) && !isCategorical) {
                        var nVal = num(refValTrim);
                        var xPctN = (nVal - minX) / (maxX - minX);
                        refScreenX = margin + (xPctN * w);
                    } else {
                        refScreenX = margin + (w / 2);
                    }
                    x1 = x2 = refScreenX;
                    y1 = baseY;
                    y2 = baseY - h;
                }

                var rGrp = refContents.addProperty("ADBE Vector Group");
                rGrp.name = "RefLine_Group";
                var rGrpContents = safeProperty(rGrp, "ADBE Vectors Group", 2, "Contents");
                if (rGrpContents) {
                    var refShape = rGrpContents.addProperty("ADBE Vector Shape - Group");
                    if (refShape) {
                        var refPath = new Shape();
                        refPath.vertices = [[x1, y1], [x2, y2]];
                        refPath.closed = false;
                        safeProperty(refShape, "ADBE Vector Shape", 1, "Path").setValue(refPath);
                    }

                    var refStroke = rGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                    if (refStroke) {
                        var cRef = refLineColor || [0.8, 0.1, 0.1];
                        safeProperty(refStroke, "ADBE Vector Stroke Color", 4, "Color").setValue(cRef);
                        safeProperty(refStroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(refLineWidth || 2);

                        if (refLineStyle === "Dashed") {
                            var dashes = safeProperty(refStroke, "ADBE Vector Stroke Dashes", 10, "Dashes");
                            if (dashes) {
                                try {
                                    dashes.addProperty("ADBE Vector Stroke Dash 1");
                                    safeProperty(dashes, "ADBE Vector Stroke Dash 1", 1, "Dash").setValue(8);
                                    dashes.addProperty("ADBE Vector Stroke Gap 1");
                                    safeProperty(dashes, "ADBE Vector Stroke Gap 1", 2, "Gap").setValue(6);
                                } catch(eDash) {}
                            }
                        } else if (refLineStyle === "Dotted") {
                            var dashesD = safeProperty(refStroke, "ADBE Vector Stroke Dashes", 10, "Dashes");
                            if (dashesD) {
                                try {
                                    safeProperty(refStroke, "ADBE Vector Stroke Line Cap", 6, "Line Cap").setValue(2);
                                    dashesD.addProperty("ADBE Vector Stroke Dash 1");
                                    safeProperty(dashesD, "ADBE Vector Stroke Dash 1", 1, "Dash").setValue(0.1);
                                    dashesD.addProperty("ADBE Vector Stroke Gap 1");
                                    safeProperty(dashesD, "ADBE Vector Stroke Gap 1", 2, "Gap").setValue(6);
                                } catch(eDot) {}
                            }
                        }
                    }

                    if (isAnimated && animateRefLine) {
                        var refTrim = rGrpContents.addProperty("ADBE Vector Filter - Trim");
                        if (refTrim) {
                            var refTrimEnd = safeProperty(refTrim, "ADBE Vector Trim End", 2, "End");
                            if (refTrimEnd) {
                                refTrimEnd.setValueAtTime(0, 0);
                                refTrimEnd.setValueAtTime(Math.min(1.2, totDuration), 100);
                            }
                        }
                    }
                }

                if (refLineLabel && refLineLabel.replace(/^\s+|\s+$/g, '') !== "") {
                    var lblX = isRefY ? (rightYAxis ? margin + 10 : comp.width - margin - 10) : x1;
                    var lblY = isRefY ? y1 - (currentFontSize * 0.4 + 4) : baseY - h - (currentFontSize * 0.4 + 4);
                    var lblJust = isRefY ? (rightYAxis ? "left" : "right") : "center";
                    var refLabelLayer = createText(comp, refLineLabel, [lblX, lblY], lblJust, "Label_Ref_" + refLineVal, currentFontSize * 0.85);
                    labelsToElevate.push(refLabelLayer);

                    if (isAnimated && animateRefLine) {
                        var lblTrans = safeProperty(refLabelLayer, "ADBE Transform Group", 3, "Transform");
                        if (lblTrans) {
                            var lblOp = safeProperty(lblTrans, "ADBE Opacity", 11, "Opacity");
                            if (lblOp) {
                                var animEnd = Math.min(1.2, totDuration);
                                lblOp.setValueAtTime(animEnd * 0.5, 0);
                                lblOp.setValueAtTime(animEnd + 0.3, 100);
                            }
                        }
                    }
                }
            }
            refLayer.moveToBeginning();
        }

        if (graphTitleText && graphTitleText !== "") {
            var titleLayer = createText(comp, graphTitleText, [comp.width / 2, margin / 2], "center", "Graph_Title", currentFontSize * 1.5);
            labelsToElevate.push(titleLayer);
            var tOp = safeProperty(titleLayer, "ADBE Transform Group", 3, "Transform");
            if (tOp) {
                var tOpProp = safeProperty(tOp, "ADBE Opacity", 11, "Opacity");
                if (tOpProp) {
                    if (isAnimated && animateAxes) {
                        tOpProp.setValueAtTime(0.5, 0); tOpProp.setValueAtTime(1.1, 100);
                    } else { tOpProp.setValue(100); }
                }
            }
        }

        if (drawLegend && groupNames.length > 0) {
            var legendLayer = makeShapeLayer(comp, "Graph_Legend");
            var legendContents = safeProperty(legendLayer, "ADBE Root Vectors Group", 2, "Contents");

            if (legendContents) {
                var legendItemHeight = currentFontSize * 1.5;
                var swatchWidth = currentFontSize * 1.4;
                var swatchHeight = currentFontSize * 1.0;
                var gap = currentFontSize * 0.4;
                var padX = 30;
                var padY = 20;

                var isLeft = (legendPosition.indexOf("Left") !== -1);
                var isCenterY = (legendPosition.indexOf("Center") !== -1);
                var isBottom = (legendPosition.indexOf("Bottom") !== -1);

                var totalLegendHeight = (legendOrientation === "Horizontal")
                    ? legendItemHeight
                    : (groupNames.length * legendItemHeight);

                var legendYStart = margin + padY;
                if (legendOrientation === "Horizontal") {
                    if (isBottom) {
                        legendYStart = baseY + currentFontSize * 2.2 + 8;
                    } else if (isCenterY) {
                        legendYStart = (comp.height / 2) - (legendItemHeight / 2);
                    } else {
                        legendYStart = margin - legendItemHeight - 8;
                    }
                } else {
                    if (isCenterY) legendYStart = (comp.height / 2) - (totalLegendHeight / 2);
                    else if (isBottom) legendYStart = comp.height - margin - totalLegendHeight - padY;
                }

                if (legendOrientation === "Horizontal") {
                    var itemWidths = [];
                    var totalHorizontalWidth = 0;
                    for (var g = 0; g < groupNames.length; g++) {
                        var sName = groupNames[g];
                        var itemW = swatchWidth + gap + (sName.length * currentFontSize * 0.55) + (currentFontSize * 0.8);
                        itemWidths.push(itemW);
                        totalHorizontalWidth += itemW;
                    }

                    var startX = isLeft ? margin + padX : comp.width - margin - padX - totalHorizontalWidth;
                    var currentX = startX;

                    for (var gIdx = 0; gIdx < groupNames.length; gIdx++) {
                        var sName = groupNames[gIdx];
                        var seriesColorObj = CONFIG.activeSeriesColors[sName] || { fill: CONFIG.defaultFillPalette[gIdx % 6], stroke: CONFIG.defaultStrokePalette[gIdx % 6] };
                        var itemYCenter = legendYStart + (legendItemHeight / 2);
                        var symbolCenterX = currentX + (swatchWidth / 2);
                        var textDrawX = currentX + swatchWidth + gap;

                        var itemText = createText(comp, sName, [textDrawX, itemYCenter + (currentFontSize / 4)], "left", "LegendText_" + sName, currentFontSize);
                        labelsToElevate.push(itemText);
                        var textOp = safeProperty(itemText, "ADBE Transform Group", 3, "Transform");
                        if (textOp) {
                            var textOpProp = safeProperty(textOp, "ADBE Opacity", 11, "Opacity");
                            if (textOpProp) {
                                if (isAnimated && animateAxes) {
                                    textOpProp.setValueAtTime(0.9 + (gIdx * 0.1), 0);
                                    textOpProp.setValueAtTime(1.4 + (gIdx * 0.1), 100);
                                } else { textOpProp.setValue(100); }
                            }
                        }

                        var symbolGrp = legendContents.addProperty("ADBE Vector Group");
                        symbolGrp.name = "Symbol_" + sName;
                        var symbolGrpContents = safeProperty(symbolGrp, "ADBE Vectors Group", 2, "Contents");
                        if (symbolGrpContents) {
                            var symTrans = safeProperty(symbolGrp, "ADBE Vector Transform Group", 3, "Transform");
                            if (symTrans) safeProperty(symTrans, "ADBE Vector Position", 2, "Position").setValue([symbolCenterX, itemYCenter]);

                            var useBlockLegend = (type === "Bar") || (type === "Line" && fillLines);
                            if (useBlockLegend) {
                                var rectShape = symbolGrpContents.addProperty("ADBE Vector Shape - Rect");
                                if (rectShape) {
                                    safeProperty(rectShape, "ADBE Vector Rect Size", 1, "Size").setValue([swatchWidth, swatchHeight]);
                                    safeProperty(rectShape, "ADBE Vector Rect Position", 2, "Position").setValue([0, 0]);
                                }
                                if ((type === "Bar" && fillBars) || (type === "Line" && fillLines)) {
                                    var sFill = symbolGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                    if (sFill) {
                                        safeProperty(sFill, "ADBE Vector Fill Color", 4, "Color").setValue((type === "Line" && !customFill) ? seriesColorObj.stroke : seriesColorObj.fill);
                                        if (type === "Line" && fillLines) {
                                            var areaOpacityValue = isNaN(customFillOpacity) ? 30 : Math.min(Math.max(customFillOpacity, 0), 100);
                                            safeProperty(sFill, "ADBE Vector Fill Opacity", 5, "Opacity").setValue(customFill ? areaOpacityValue : 30);
                                        }
                                    }
                                }
                                if ((type === "Bar" && strokeBars) || (type === "Line" && strokeLines)) {
                                    var sStroke = symbolGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                    if (sStroke) {
                                        safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                        safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                    }
                                }
                            } else {
                                var lineShape = symbolGrpContents.addProperty("ADBE Vector Shape - Group");
                                if (lineShape) {
                                    var lPath = new Shape();
                                    lPath.vertices = [[-(swatchWidth / 2), 0], [(swatchWidth / 2), 0]];
                                    lPath.closed = false;
                                    safeProperty(lineShape, "ADBE Vector Shape", 1, "Path").setValue(lPath);
                                }
                                var sStroke = symbolGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                if (sStroke) {
                                    safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                    safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                }
                                if (dots) {
                                    var dotShape = symbolGrpContents.addProperty("ADBE Vector Shape - Ellipse");
                                    if (dotShape) safeProperty(dotShape, "ADBE Vector Ellipse Size", 1, "Size").setValue([currentFontSize * 0.55, currentFontSize * 0.55]);
                                    var dFill = symbolGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                    if (dFill) safeProperty(dFill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.stroke);
                                }
                            }

                            if (symTrans) {
                                var symOpProp = safeProperty(symTrans, "ADBE Vector Opacity", 7, "Opacity");
                                if (symOpProp) {
                                    if (isAnimated && animateAxes) {
                                        symOpProp.setValueAtTime(0.9 + (gIdx * 0.1), 0);
                                        symOpProp.setValueAtTime(1.4 + (gIdx * 0.1), 100);
                                    } else { symOpProp.setValue(100); }
                                }
                            }
                        }
                        currentX += itemWidths[gIdx];
                    }
                } else {
                    for (var gIdx = 0; gIdx < groupNames.length; gIdx++) {
                        var sName = groupNames[gIdx];
                        var seriesColorObj = CONFIG.activeSeriesColors[sName] || { fill: CONFIG.defaultFillPalette[gIdx % 6], stroke: CONFIG.defaultStrokePalette[gIdx % 6] };
                        var itemYCenter = legendYStart + (gIdx * legendItemHeight) + (legendItemHeight / 2);
                        var symbolCenterX = isLeft ? margin + padX + (swatchWidth / 2) : comp.width - margin - padX - (swatchWidth / 2);
                        var textDrawX = isLeft ? margin + padX + swatchWidth + gap : comp.width - margin - padX - swatchWidth - gap;
                        var textJustify = isLeft ? "left" : "right";

                        var itemText = createText(comp, sName, [textDrawX, itemYCenter + (currentFontSize / 4)], textJustify, "LegendText_" + sName, currentFontSize);
                        labelsToElevate.push(itemText);
                        var textOp = safeProperty(itemText, "ADBE Transform Group", 3, "Transform");
                        if (textOp) {
                            var textOpProp = safeProperty(textOp, "ADBE Opacity", 11, "Opacity");
                            if (textOpProp) {
                                if (isAnimated && animateAxes) {
                                    textOpProp.setValueAtTime(0.9 + (gIdx * 0.1), 0);
                                    textOpProp.setValueAtTime(1.4 + (gIdx * 0.1), 100);
                                } else { textOpProp.setValue(100); }
                            }
                        }

                        var symbolGrp = legendContents.addProperty("ADBE Vector Group");
                        symbolGrp.name = "Symbol_" + sName;
                        var symbolGrpContents = safeProperty(symbolGrp, "ADBE Vectors Group", 2, "Contents");
                        if (symbolGrpContents) {
                            var symTrans = safeProperty(symbolGrp, "ADBE Vector Transform Group", 3, "Transform");
                            if (symTrans) safeProperty(symTrans, "ADBE Vector Position", 2, "Position").setValue([symbolCenterX, itemYCenter]);

                            var useBlockLegend = (type === "Bar") || (type === "Line" && fillLines);
                            if (useBlockLegend) {
                                var rectShape = symbolGrpContents.addProperty("ADBE Vector Shape - Rect");
                                if (rectShape) {
                                    safeProperty(rectShape, "ADBE Vector Rect Size", 1, "Size").setValue([swatchWidth, swatchHeight]);
                                    safeProperty(rectShape, "ADBE Vector Rect Position", 2, "Position").setValue([0, 0]);
                                }
                                if ((type === "Bar" && fillBars) || (type === "Line" && fillLines)) {
                                    var sFill = symbolGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                    if (sFill) {
                                        safeProperty(sFill, "ADBE Vector Fill Color", 4, "Color").setValue((type === "Line" && !customFill) ? seriesColorObj.stroke : seriesColorObj.fill);
                                        if (type === "Line" && fillLines) {
                                            var areaOpacityValue = isNaN(customFillOpacity) ? 30 : Math.min(Math.max(customFillOpacity, 0), 100);
                                            safeProperty(sFill, "ADBE Vector Fill Opacity", 5, "Opacity").setValue(customFill ? areaOpacityValue : 30);
                                        }
                                    }
                                }
                                if ((type === "Bar" && strokeBars) || (type === "Line" && strokeLines)) {
                                    var sStroke = symbolGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                    if (sStroke) {
                                        safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                        safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                    }
                                }
                            } else {
                                var lineShape = symbolGrpContents.addProperty("ADBE Vector Shape - Group");
                                if (lineShape) {
                                    var lPath = new Shape();
                                    lPath.vertices = [[-(swatchWidth / 2), 0], [(swatchWidth / 2), 0]];
                                    lPath.closed = false;
                                    safeProperty(lineShape, "ADBE Vector Shape", 1, "Path").setValue(lPath);
                                }
                                var sStroke = symbolGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                if (sStroke) {
                                    safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color").setValue(seriesColorObj.stroke);
                                    safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width").setValue(currentStrokeWidth);
                                }
                                if (dots) {
                                    var dotShape = symbolGrpContents.addProperty("ADBE Vector Shape - Ellipse");
                                    if (dotShape) safeProperty(dotShape, "ADBE Vector Ellipse Size", 1, "Size").setValue([currentFontSize * 0.55, currentFontSize * 0.55]);
                                    var dFill = symbolGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                    if (dFill) safeProperty(dFill, "ADBE Vector Fill Color", 4, "Color").setValue(seriesColorObj.stroke);
                                }
                            }

                            if (symTrans) {
                                var symOpProp = safeProperty(symTrans, "ADBE Vector Opacity", 7, "Opacity");
                                if (symOpProp) {
                                    if (isAnimated && animateAxes) {
                                        symOpProp.setValueAtTime(0.9 + (gIdx * 0.1), 0);
                                        symOpProp.setValueAtTime(1.4 + (gIdx * 0.1), 100);
                                    } else { symOpProp.setValue(100); }
                                }
                            }
                        }
                    }
                }
            }
            if (legendLayer) legendLayer.moveToBeginning();
        }

        if (axisLayer) {
            try { axisLayer.moveToBeginning(); } catch(eAxis) {}
        }
        for (var L = 0; L < labelsToElevate.length; L++) {
            try {
                if (labelsToElevate[L]) labelsToElevate[L].moveToBeginning();
            } catch(eElevate) {}
        }
    }

    function drawAxis(comp, x, y, w, h, strokeWidthValue, animateAxes, drawX, drawY, rightYAxis, baseY){
        var axis = makeShapeLayer(comp, "Graph_Axes");
        var contents = safeProperty(axis, "ADBE Root Vectors Group", 2, "Contents");
        if (contents) {
            var g = contents.addProperty("ADBE Vector Group");
            var gg = safeProperty(g, "ADBE Vectors Group", 2, "Contents");
            if (gg) {
                function makeLineShape(x1, y1, x2, y2){
                    var s = new Shape();
                    s.vertices = [[x1, y1], [x2, y2]];
                    s.closed = false;
                    return s;
                }

                if (drawX) {
                    var xLine = gg.addProperty("ADBE Vector Shape - Group");
                    if (xLine) {
                        xLine.name = "X_Axis";
                        var pathProp = safeProperty(xLine, "ADBE Vector Shape", 1, "Path");
                        if (pathProp) pathProp.setValue(makeLineShape(CONFIG.margin, y, comp.width - CONFIG.margin, y));
                    }
                }

                if (drawY) {
                    var yLine = gg.addProperty("ADBE Vector Shape - Group");
                    if (yLine) {
                        yLine.name = "Y_Axis";
                        var pathProp = safeProperty(yLine, "ADBE Vector Shape", 1, "Path");
                        var yBottom = (baseY !== undefined) ? baseY : y;
                        if (pathProp) pathProp.setValue(makeLineShape(x, yBottom, x, yBottom - h));
                    }
                }

                if (drawX || drawY) {
                    var stroke = gg.addProperty("ADBE Vector Graphic - Stroke");
                    if (stroke) {
                        var strokeCol = safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color");
                        if (strokeCol) strokeCol.setValue(CONFIG.axisColor);
                        var strokeWidth = safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                        if (strokeWidth) strokeWidth.setValue(strokeWidthValue);
                    }
                    
                    if (animateAxes) {
                        var trim = gg.addProperty("ADBE Vector Filter - Trim");
                        if (trim) {
                            var trimEnd = safeProperty(trim, "ADBE Vector Trim End", 2, "End");
                            if (trimEnd) {
                                trimEnd.setValueAtTime(0, 0);
                                trimEnd.setValueAtTime(1.0, 100);
                            }
                        }
                    }
                } else {
                    try { axis.remove(); } catch(e) {}
                }
            }
        }
        return axis;
    }

    function handledSelectionRestore() {
        try {
            var activeComp = app.project.activeItem;
            if (activeComp && activeComp.selectedLayers.length > 0) {
                var currentSelections = activeComp.selectedLayers;
                for (var s = 0; s < currentSelections.length; s++) {
                    currentSelections[s].selected = false;
                }
            }
        } catch(e) {}
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { 
        ui.center(); 
        ui.show(); 
    }

})(this);
