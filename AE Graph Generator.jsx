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
        fontSize: 25, // Default font size set to 25
        fontFamily: "Helvetica", // Will fall back gracefully
        axisColor: [0,0,0], // DEFAULT: Solid Black Axes (#000000)
        gridColor: null, // Custom Grid Color -- defaults to axisColor if null
        
        // Base palette arrays used to assign default values to dynamically discovered series
        defaultFillPalette: [
            [0.784, 0.004, 0.008], // #C80102 (Rich Red)
            [0.024, 0.000, 0.498], // #06007F (Deep Blue)
            [0.369, 0.369, 0.369], // #5E5E5E (Dark Gray)
            [0.790, 0.560, 0.030], // Warm Gold
            [0.530, 0.220, 0.770], // Purple
            [0.770, 0.360, 0.080]  // Dark Orange
        ],
        defaultStrokePalette: [
            [0.784, 0.004, 0.008], // #C80102 (Rich Red)
            [0.024, 0.000, 0.498], // #06007F (Deep Blue)
            [0.369, 0.369, 0.369], // #5E5E5E (Dark Gray)
            [0.790, 0.560, 0.030], // Warm Gold
            [0.530, 0.220, 0.770], // Purple
            [0.770, 0.360, 0.080]  // Dark Orange
        ],
        
        // Runtime storage mapped to unique series names
        activeSeriesColors: {}
    };

    // ================= SAFE PROPERTY HELPER (UNBREAKABLE ENGINE) =================

    function safeProperty(parent, matchName, fallbackIndex, displayName) {
        if (!parent) return null;
        var prop = null;
        
        // 1. Try Match Name
        try { prop = parent.property(matchName); } catch(e) {}
        if (prop) return prop;
        
        // 2. Try Display Name (useful for localized systems)
        if (displayName) {
            try { prop = parent.property(displayName); } catch(e) {}
            if (prop) return prop;
        }
        
        // 3. Try Index Fallback
        if (typeof fallbackIndex === "number" && fallbackIndex <= parent.numProperties) {
            try { prop = parent.property(fallbackIndex); } catch(e) {}
            if (prop) return prop;
        }
        
        // 4. Exhaustive Loop Fallback: Scan everything in property tree
        try {
            for (var i = 1; i <= parent.numProperties; i++) {
                var p = parent.property(i);
                if (p && (p.matchName === matchName || p.name === displayName)) {
                    return p;
                }
            }
        } catch(e) { }
        
        return null;
    }

    // ================= COLOR & FORMATTING UTILITIES =================

    function cleanHex(str) {
        if (!str) return null;
        str = str.replace(/^#/, ''); // Strip leading hash
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
                    var w = (this.size && this.size[0] > 0) ? this.size[0] : 20;
                    var h = (this.size && this.size[1] > 0) ? this.size[1] : 20;
                    g2.rectPath(0, 0, w, h);
                    g2.fillPath(brush2);
                } catch(e) {}
            };
            
            if (elem.parent && elem.parent.layout && typeof elem.parent.layout.layout === "function") {
                elem.parent.layout.layout(true);
            }
        } catch(e) {}
    }

    function getNiceStep(range, targetDivisions) {
        var roughStep = range / targetDivisions;
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

    function formatNumber(value, decimals, separator) {
        var numVal = parseFloat(value);
        if (isNaN(numVal)) return value.toString();
        
        var numStr = numVal.toFixed(decimals);
        var parts = numStr.split(".");
        var intPart = parts[0];
        var decPart = parts.length > 1 ? "." + parts[1] : "";
        
        var formattedInt = "";
        var len = intPart.length;
        for (var i = 0; i < len; i++) {
            if (i > 0 && (len - i) % 3 === 0 && intPart.charAt(i) !== '-') {
                formattedInt += separator;
            }
            formattedInt += intPart.charAt(i);
        }
        return formattedInt + decPart;
    }

    // ================= HELPERS & CSV PARSERS =================

    function num(v){
        var n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }

    function isNumeric(val) {
        if (typeof val === "number") return true;
        if (typeof val !== "string") return false;
        return !isNaN(val) && !isNaN(parseFloat(val));
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

    // Custom text file parser
    function parseHeaders(text, delimiter){
        if (!text) return [];
        var lines = text.split(/\r?\n/);
        var firstLine = "";
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].replace(/^\s+|\s+$/g, '');
            if (l !== "") {
                firstLine = lines[i];
                break;
            }
        }
        if (firstLine === "") return [];
        return splitLine(firstLine, delimiter);
    }

    function fill(dd, items){
        if (dd.removeAll) {
            dd.removeAll();
        } else {
            while (dd.items.length > 0) {
                dd.remove(0);
            }
        }
        for(var i=0; i<items.length; i++) {
            dd.add("item", items[i]);
        }
        if(dd.items.length > 0) {
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

    // Helper function for text layer configurations
    function createText(comp, textStr, pos, justify, name, customFontSize) {
        var textLayer = comp.layers.addText(textStr);
        textLayer.name = name || "Label_" + textStr;
        
        var textPropGroup = safeProperty(textLayer, "ADBE Text Properties", 1, "Text");
        if (!textPropGroup) return textLayer;
        
        var sourceText = safeProperty(textPropGroup, "ADBE Text Document", 1, "Source Text");
        if (!sourceText) return textLayer;
        
        var textDoc = sourceText.value;
        
        // SAFE FONT ASSIGNMENT LAYER
        try {
            textDoc.font = CONFIG.fontFamily;
        } catch (errFont1) {
            try {
                textDoc.font = "Helvetica";
            } catch (errFont2) {
                try {
                    textDoc.font = "ArialMT";
                } catch (errFont3) {
                    // Let After Effects fall back to its default
                }
            }
        }
        
        textDoc.fontSize = customFontSize || CONFIG.fontSize;
        textDoc.fillColor = CONFIG.axisColor;
        textDoc.applyFill = true;
        
        if (justify === "left") {
            textDoc.justification = ParagraphJustification.LEFT_JUSTIFY;
        } else if (justify === "right") {
            textDoc.justification = ParagraphJustification.RIGHT_JUSTIFY;
        } else {
            textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
        }
        
        sourceText.setValue(textDoc);
        
        var trans = safeProperty(textLayer, "ADBE Transform Group", 3, "Transform");
        if (trans) {
            var positionProp = safeProperty(trans, "ADBE Position", 2, "Position");
            if (positionProp) positionProp.setValue(pos);
        }
        return textLayer;
    }

    // ================= UI BUILDER =================

    function buildUI(thisObj){
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "AE Graph Generator Pro", undefined, {resizeable: true});

        win.onResizing = win.onResize = function() {
            this.layout.resize();
        };

        win.orientation = "column";
        win.alignChildren = ["fill", "fill"];
        win.spacing = 8;
        win.margins = 12;

        var tabGroup = win.add("tabbedpanel", undefined, undefined);
        tabGroup.alignment = ["fill", "fill"];

        // --- TAB 1: CSV DATA IMPORT PANEL ---
        var tabData = tabGroup.add("tab", undefined, "1. Data Input");
        tabData.orientation = "column";
        tabData.alignChildren = ["fill", "fill"];
        tabData.margins = 10;

        var tabDataScroll = tabData.add("group", undefined, {scrolling: true});
        tabDataScroll.orientation = "column";
        tabDataScroll.alignChildren = ["fill", "top"];
        tabDataScroll.spacing = 8;

        var csvGrp = tabDataScroll.add("panel", undefined, "Pasted Spreadsheet / CSV Cells");
        csvGrp.orientation = "column";
        csvGrp.alignChildren = ["fill", "top"];
        csvGrp.spacing = 6;
        csvGrp.margins = 10;

        var csvInput = csvGrp.add("edittext", undefined, "", {multiline: true, scrolling: true});
        csvInput.preferredSize = [-1, 150];

        var configRow = csvGrp.add("group");
        configRow.orientation = "row";
        configRow.alignChildren = ["left", "center"];
        configRow.spacing = 10;
        
        configRow.add("statictext", undefined, "Delimiter:");
        var delimInput = configRow.add("edittext", undefined, "auto"); 
        delimInput.preferredSize = [45, 20];

        configRow.add("statictext", undefined, "Format:");
        var formatDD = configRow.add("dropdownlist", undefined, ["Long (Rows)", "Wide (Columns)"]);
        formatDD.selection = 0; 
        formatDD.preferredSize = [110, 20];

        var transposeChk = csvGrp.add("checkbox", undefined, "Transpose / Flip Wide Data Rows");
        transposeChk.value = false;
        transposeChk.helpTip = "Inverts categories and series fields in Wide spreadsheets.";

        var loadBtn = tabDataScroll.add("button", undefined, "Load Dataset Columns");
        loadBtn.preferredSize = [-1, 30];

        // --- TAB 2: MAPPING, CORE TYPE & COLOR SETTINGS ---
        var tabMapColors = tabGroup.add("tab", undefined, "2. Mapping & Colors");
        tabMapColors.orientation = "column";
        tabMapColors.alignChildren = ["fill", "fill"];
        tabMapColors.margins = 10;

        var tabMapScroll = tabMapColors.add("group", undefined, {scrolling: true});
        tabMapScroll.orientation = "column";
        tabMapScroll.alignChildren = ["fill", "top"];
        tabMapScroll.spacing = 8;

        var mapPanel = tabMapScroll.add("panel", undefined, "Axis Mapping Setup");
        mapPanel.orientation = "column";
        mapPanel.alignChildren = ["fill", "top"];
        mapPanel.spacing = 6;
        mapPanel.margins = 10;

        var xRowGrp = mapPanel.add("group");
        xRowGrp.orientation = "row";
        xRowGrp.alignChildren = ["left", "center"];
        var xLabel = xRowGrp.add("statictext", undefined, "X Axis:");
        xLabel.preferredSize = [100, 20];
        var xDD = xRowGrp.add("dropdownlist", undefined);
        xDD.alignment = ["fill", "center"];

        var yRowGrp = mapPanel.add("group");
        yRowGrp.orientation = "row";
        yRowGrp.alignChildren = ["left", "center"];
        var yLabel = yRowGrp.add("statictext", undefined, "Y Axis:");
        yLabel.preferredSize = [100, 20];
        var yDD = yRowGrp.add("dropdownlist", undefined);
        yDD.alignment = ["fill", "center"];

        // Value Labels Column sits directly under Y Axis
        var valueLabelsRowGrp = mapPanel.add("group");
        valueLabelsRowGrp.orientation = "row";
        valueLabelsRowGrp.alignChildren = ["left", "center"];
        var valueLabelSrcLabel = valueLabelsRowGrp.add("statictext", undefined, "Value Labels:");
        valueLabelSrcLabel.preferredSize = [100, 20];
        var valueLabelDD = valueLabelsRowGrp.add("dropdownlist", undefined);
        valueLabelDD.alignment = ["fill", "center"];

        var sRowGrp = mapPanel.add("group");
        sRowGrp.orientation = "row";
        sRowGrp.alignChildren = ["left", "center"];
        var sLabel = sRowGrp.add("statictext", undefined, "Series:");
        sLabel.preferredSize = [100, 20];
        var sDD = sRowGrp.add("dropdownlist", undefined);
        sDD.alignment = ["fill", "center"];

        var typeGrp = mapPanel.add("group");
        typeGrp.orientation = "row";
        typeGrp.alignChildren = ["left", "center"];
        var typeLabel = typeGrp.add("statictext", undefined, "Chart Type:");
        typeLabel.preferredSize = [100, 20];
        var typeDD = typeGrp.add("dropdownlist", undefined, ["Line", "Bar"]);
        typeDD.selection = 0;
        typeDD.alignment = ["fill", "center"];

        var stackRow = mapPanel.add("group");
        stackRow.orientation = "row";
        stackRow.alignChildren = ["left", "center"];
        var stackLblSpace = stackRow.add("statictext", undefined, "");
        stackLblSpace.preferredSize = [100, 20];
        var stackChk = stackRow.add("checkbox", undefined, "Stacked Chart");
        stackChk.value = false;

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
        var lineStyleLbl = lineLabelGrp.add("statictext", undefined, "Lines Style:");
        lineStyleLbl.preferredSize = [70, 20];

        var lineChkRow1 = lineStyleGrp.add("group");
        lineChkRow1.orientation = "row";
        lineChkRow1.spacing = 10;
        var strokeLinesChk = lineChkRow1.add("checkbox", undefined, "Stroke Path");
        strokeLinesChk.value = true;
        
        var dotChk = lineChkRow1.add("checkbox", undefined, "Draw Dots");
        dotChk.value = false; 

        var fillLinesChk = lineChkRow1.add("checkbox", undefined, "Area Fill"); 
        fillLinesChk.value = false;

        var lineChkRow2 = lineStyleGrp.add("group");
        lineChkRow2.orientation = "row";
        lineChkRow2.spacing = 10;
        
        var customFillChk = lineChkRow2.add("checkbox", undefined, "Custom Fill Color");
        customFillChk.value = false;
        customFillChk.visible = false;

        var areaStackChk = lineChkRow2.add("checkbox", undefined, "Stacked Area");
        areaStackChk.value = false;
        areaStackChk.visible = false;

        // ADDED: Opacity input options, strictly visible when custom fill is checked
        var fillOpacityLabel = lineChkRow2.add("statictext", undefined, "Opacity %:");
        fillOpacityLabel.visible = false;
        var fillOpacityIn = lineChkRow2.add("edittext", undefined, "30");
        fillOpacityIn.preferredSize = [35, 20];
        fillOpacityIn.visible = false;

        var barStyleGrp = contextualStylesPanel.add("group");
        barStyleGrp.orientation = "column";
        barStyleGrp.alignChildren = ["left", "top"];
        barStyleGrp.spacing = 4;

        var barLabelGrp = barStyleGrp.add("group");
        barLabelGrp.orientation = "row";
        var barStyleLbl = barStyleGrp.add("statictext", undefined, "Bars Style:");
        barStyleLbl.preferredSize = [70, 20];

        var barChkRow = barStyleGrp.add("group");
        barChkRow.orientation = "row";
        barChkRow.spacing = 10;
        var fillBarsChk = barChkRow.add("checkbox", undefined, "Fill Layer");
        fillBarsChk.value = true;
        var strokeBarsChk = barChkRow.add("checkbox", undefined, "Stroke Outline");
        strokeBarsChk.value = false;
        
        var barStackChk = barChkRow.add("checkbox", undefined, "Stacked Bars");
        barStackChk.value = false;

        var layoutGrp = contextualStylesPanel.add("group");
        layoutGrp.orientation = "row";
        layoutGrp.alignChildren = ["left", "center"];
        layoutGrp.spacing = 10;
        
        var bwGrp = layoutGrp.add("group");
        bwGrp.add("statictext", undefined, "Bar Width %:");
        var barWidthInput = bwGrp.add("edittext", undefined, "70");
        barWidthInput.preferredSize = [35, 20];

        var bgGrp = layoutGrp.add("group");
        bgGrp.add("statictext", undefined, "Gap %:");
        var barGapInput = bgGrp.add("edittext", undefined, "25");
        barGapInput.preferredSize = [35, 20];

        var colorsPanel = tabMapScroll.add("panel", undefined, "Palette Configuration");
        colorsPanel.orientation = "column";
        colorsPanel.alignChildren = ["fill", "center"];
        colorsPanel.spacing = 4;
        colorsPanel.margins = 10;

        var colHeaders = colorsPanel.add("group");
        colHeaders.orientation = "row";
        colHeaders.alignChildren = ["left", "center"];
        colHeaders.spacing = 6;
        
        var headLabelSpacing = colHeaders.add("statictext", undefined, "");
        headLabelSpacing.preferredSize = [80, 15];
        
        var fillHeader = colHeaders.add("statictext", undefined, "Fill Color");
        fillHeader.preferredSize = [96, 15];
        fillHeader.alignment = "center";
        
        var strokeHeader = colHeaders.add("statictext", undefined, "Stroke Color");
        strokeHeader.preferredSize = [96, 15];
        strokeHeader.alignment = "center";

        var dynamicListGrp = colorsPanel.add("group");
        dynamicListGrp.orientation = "column";
        dynamicListGrp.alignChildren = ["fill", "top"];
        dynamicListGrp.spacing = 4;

        var axisRow = colorsPanel.add("group");
        axisRow.orientation = "column";
        axisRow.alignChildren = ["fill", "center"];
        axisRow.spacing = 4;

        var coreAxisColGroup = axisRow.add("group");
        coreAxisColGroup.orientation = "row";
        coreAxisColGroup.alignChildren = ["left", "center"];
        coreAxisColGroup.spacing = 6;

        var axisLbl = coreAxisColGroup.add("statictext", undefined, "Axes & Labels:");
        axisLbl.preferredSize = [100, 20];

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

        var gridColLbl = gridColGroup.add("statictext", undefined, "Grid/Ticks Color:");
        gridColLbl.preferredSize = [100, 20];

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

        // --- TAB 3: GLOBAL VISUAL PARAMETERS ---
        var tabOptions = tabGroup.add("tab", undefined, "3. Global Options");
        tabOptions.orientation = "column";
        tabOptions.alignChildren = ["fill", "fill"];
        tabOptions.margins = 10;

        var tabOptionsScroll = tabOptions.add("group", undefined, {scrolling: true});
        tabOptionsScroll.orientation = "column";
        tabOptionsScroll.alignChildren = ["fill", "top"];
        tabOptionsScroll.spacing = 8;

        var opt = tabOptionsScroll.add("panel", undefined, "General Presentation Parameters");
        opt.orientation = "column";
        opt.alignChildren = ["fill", "top"];
        opt.spacing = 6;
        opt.margins = 10;

        var globalTogglesPanel = opt.add("group");
        globalTogglesPanel.orientation = "column";
        globalTogglesPanel.alignChildren = ["left", "top"];
        globalTogglesPanel.spacing = 4;

        var togglesRow1 = globalTogglesPanel.add("group");
        togglesRow1.orientation = "row";
        togglesRow1.spacing = 12;
        var xGridChk = togglesRow1.add("checkbox", undefined, "Draw X-Axis Line");
        xGridChk.value = true;
        var yGridChk = togglesRow1.add("checkbox", undefined, "Draw Y-Axis Line");
        yGridChk.value = true;
        var yAxisRightChk = togglesRow1.add("checkbox", undefined, "Y-Axis on Right");
        yAxisRightChk.value = false;

        var togglesRow2 = globalTogglesPanel.add("group");
        togglesRow2.orientation = "row";
        togglesRow2.spacing = 12;
        var xLabelChk = togglesRow2.add("checkbox", undefined, "Show X-Labels");
        xLabelChk.value = true;
        var yLabelChk = togglesRow2.add("checkbox", undefined, "Show Y-Labels");
        yLabelChk.value = true;
        var valueLabelChk = togglesRow2.add("checkbox", undefined, "Show Value Labels");
        valueLabelChk.value = false;

        var labelStyleRow = globalTogglesPanel.add("group");
        labelStyleRow.orientation = "row";
        labelStyleRow.spacing = 10;
        labelStyleRow.add("statictext", undefined, "Label Position:");
        var valueLabelPosDD = labelStyleRow.add("dropdownlist", undefined, ["Above Bar / Node", "Center of Bar"]);
        valueLabelPosDD.selection = 0;
        valueLabelPosDD.preferredSize = [140, 20];

        // Draw Total Sum (Stacked) is unchecked by default
        var drawTotalSumChk = labelStyleRow.add("checkbox", undefined, "Draw Total Sum (Stacked)");
        drawTotalSumChk.value = false;

        var togglesRow3 = globalTogglesPanel.add("group");
        togglesRow3.orientation = "row";
        togglesRow3.spacing = 12;
        var animateAxesChk = togglesRow3.add("checkbox", undefined, "Animate Axes");
        animateAxesChk.value = true;
        var legendChk = togglesRow3.add("checkbox", undefined, "Draw Legend");
        legendChk.value = true;

        var gridConfigGrp = opt.add("panel", undefined, "Grid Configuration");
        gridConfigGrp.orientation = "column";
        gridConfigGrp.alignChildren = ["fill", "center"];
        gridConfigGrp.spacing = 6;
        gridConfigGrp.margins = 8;

        var ticksFlowGrp = gridConfigGrp.add("group");
        ticksFlowGrp.orientation = "column";
        ticksFlowGrp.alignChildren = ["left", "top"];
        ticksFlowGrp.spacing = 4;

        var xTicksRow = ticksFlowGrp.add("group");
        xTicksRow.orientation = "row";
        xTicksRow.spacing = 10;
        xTicksRow.add("statictext", undefined, "X-Axis Tick Style:");
        var xTickDD = xTicksRow.add("dropdownlist", undefined, ["None", "Short Ticks", "Full Grid"]);
        xTickDD.selection = 1; 
        xTickDD.preferredSize = [110, 20];

        var yTicksRow = ticksFlowGrp.add("group");
        yTicksRow.orientation = "row";
        yTicksRow.spacing = 10;
        yTicksRow.add("statictext", undefined, "Y-Axis Tick Style:");
        var yTickDD = yTicksRow.add("dropdownlist", undefined, ["None", "Short Ticks", "Full Grid"]);
        yTickDD.selection = 2; 
        yTickDD.preferredSize = [110, 20];

        var sizeRow = gridConfigGrp.add("group");
        sizeRow.orientation = "row";
        sizeRow.alignChildren = ["left", "center"];
        sizeRow.spacing = 10;

        sizeRow.add("statictext", undefined, "Axis Width:");
        var axisWidthIn = sizeRow.add("edittext", undefined, "2");
        axisWidthIn.preferredSize = [35, 20];

        sizeRow.add("statictext", undefined, "Grid/Tick Width:");
        var gridWidthIn = sizeRow.add("edittext", undefined, "1");
        gridWidthIn.preferredSize = [35, 20];

        var fontGrp = opt.add("group");
        fontGrp.orientation = "row";
        fontGrp.alignChildren = ["left", "center"];
        fontGrp.spacing = 6;
        
        var fontLeftGrp = fontGrp.add("group");
        fontLeftGrp.orientation = "row";
        fontLeftGrp.spacing = 4;
        fontLeftGrp.add("statictext", undefined, "Font:");

        var fontDD = fontLeftGrp.add("dropdownlist", undefined, ["Helvetica", "ArialMT", "Courier", "TimesNewRomanPSMT"]);
        fontDD.selection = 0;
        fontDD.preferredSize = [110, 20];

        fontDD.onChange = function() {
            if (fontDD.selection) {
                CONFIG.fontFamily = fontDD.selection.text;
            }
        };

        var sepRightGrp = fontGrp.add("group");
        sepRightGrp.orientation = "row";
        sepRightGrp.spacing = 4;
        sepRightGrp.add("statictext", undefined, "Thousand Sep:");
        
        var thousandsSepInput = sepRightGrp.add("edittext", undefined, ",");
        thousandsSepInput.preferredSize = [35, 20];

        var sizeControlGrp = opt.add("group");
        sizeControlGrp.orientation = "row";
        sizeControlGrp.alignChildren = ["left", "center"];
        sizeControlGrp.spacing = 10;

        sizeControlGrp.add("statictext", undefined, "Font Size:");
        var fontSizeIn = sizeControlGrp.add("edittext", undefined, "25"); 
        fontSizeIn.preferredSize = [40, 20];

        var legendAlignRow = opt.add("group");
        legendAlignRow.orientation = "row";
        legendAlignRow.alignChildren = ["left", "center"];
        legendAlignRow.spacing = 10;
        legendAlignRow.add("statictext", undefined, "Legend:");
        var legendAlignDD = legendAlignRow.add("dropdownlist", undefined, ["Top Right", "Top Left", "Bottom Right", "Bottom Left"]);
        legendAlignDD.selection = 0; 
        legendAlignDD.preferredSize = [110, 20];

        legendAlignRow.add("statictext", undefined, "Layout:");
        var legendOrientDD = legendAlignRow.add("dropdownlist", undefined, ["Vertical", "Horizontal"]);
        legendOrientDD.selection = 0;
        legendOrientDD.preferredSize = [100, 20];

        var titleGrp = opt.add("group");
        titleGrp.orientation = "row";
        titleGrp.alignChildren = ["left", "center"];
        titleGrp.spacing = 6;
        titleGrp.add("statictext", undefined, "Graph Title:");
        var titleInput = titleGrp.add("edittext", undefined, "");
        titleInput.preferredSize = [200, 20];

        // --- ALWAYS VISIBLE STICKY BOTTOM RUN BLOCK ---
        var genBtn = win.add("button", undefined, "Generate Graph inside Active Composition");
        genBtn.preferredSize = [-1, 35];
        genBtn.alignment = ["fill", "bottom"];

        // --- Interaction Logic Functions ---

        function resolveDelimiter() {
            var rawText = csvInput.text;
            var val = delimInput.text;
            if (val !== "auto" && val !== "") return val;
            if (rawText.indexOf("\t") !== -1) return "\t";
            if (rawText.indexOf(";") !== -1) return ";";
            return ",";
        }

        // Contextual evaluator that dynamically displays or hides "Draw Total Sum" checkbox
        function updateTotalSumVisibility() {
            var isLine = typeDD.selection.index === 0;
            var isStacked = false;
            if (isLine) {
                isStacked = fillLinesChk.value && areaStackChk.value;
            } else {
                isStacked = barStackChk.value;
            }
            drawTotalSumChk.visible = isStacked;
            win.layout.layout(true);
        }

        function updateSeriesColorsUI() {
            while (dynamicListGrp.children.length > 0) {
                dynamicListGrp.remove(dynamicListGrp.children[0]);
            }

            var dChar = resolveDelimiter();
            var rawLines = csvInput.text.split(/\r?\n/);
            var raw = [];
            for (var i = 0; i < rawLines.length; i++) {
                var trimmedLine = rawLines[i].replace(/^\s+|\s+$/g, '');
                if (trimmedLine !== "") raw.push(rawLines[i]);
            }

            if (raw.length < 2) return;

            var headers = parseHeaders(raw[0], dChar);
            var sVal = safeDD(sDD);
            var yVal = safeDD(yDD);

            var activeSeriesList = [];
            
            if (sVal && sVal !== "" && headers.indexOf(sVal) !== -1) {
                var sIdx = headers.indexOf(sVal);
                for (var j = 1; j < raw.length; j++) {
                    var r = splitLine(raw[j], dChar);
                    if (r[sIdx]) {
                        var cleanVal = r[sIdx].replace(/^\s+|\s+$/g, '');
                        if (cleanVal !== "" && activeSeriesList.indexOf(cleanVal) === -1) {
                            activeSeriesList.push(cleanVal);
                        }
                    }
                }
            } else if (yVal && yVal !== "") {
                activeSeriesList.push(yVal);
            } else {
                activeSeriesList.push("Series 1");
            }

            var cap = Math.min(activeSeriesList.length, 10);
            CONFIG.activeSeriesColors = {};

            var showFillColumn = false;
            var showStrokeColumn = false;

            if (typeDD.selection.index === 0) {
                showFillColumn = fillLinesChk.value && customFillChk.value;
                showStrokeColumn = strokeLinesChk.value;
            } else if (typeDD.selection.index === 1) {
                showFillColumn = fillBarsChk.value;
                showStrokeColumn = strokeBarsChk.value;
            }

            fillHeader.visible = showFillColumn;
            strokeHeader.visible = showStrokeColumn;

            for (var index = 0; index < cap; index++) {
                var sName = activeSeriesList[index];
                var defaultFill = CONFIG.defaultFillPalette[index % CONFIG.defaultFillPalette.length];
                var defaultStroke = CONFIG.defaultStrokePalette[index % CONFIG.defaultStrokePalette.length];
                
                CONFIG.activeSeriesColors[sName] = {
                    fill: defaultFill,
                    stroke: defaultStroke
                };

                createDynamicColorRow(sName, index, showFillColumn, showStrokeColumn);
            }

            win.layout.layout(true);
        }

        function createDynamicColorRow(sName, index, showFillColumn, showStrokeColumn) {
            if (!CONFIG.activeSeriesColors[sName]) {
                CONFIG.activeSeriesColors[sName] = {
                    fill: CONFIG.defaultFillPalette[index % CONFIG.defaultFillPalette.length],
                    stroke: CONFIG.defaultStrokePalette[index % CONFIG.defaultStrokePalette.length]
                };
            }

            var row = dynamicListGrp.add("group");
            row.orientation = "row";
            row.alignChildren = ["left", "center"];
            row.spacing = 6;

            var labelDisplay = sName.length > 10 ? sName.substring(0, 10) + "..." : sName;
            var lbl = row.add("statictext", undefined, labelDisplay);
            lbl.preferredSize = [80, 20];
            lbl.helpTip = sName;

            var fillSwatch = row.add("group", undefined);
            fillSwatch.preferredSize = [20, 20];
            setElementColor(fillSwatch, CONFIG.activeSeriesColors[sName].fill);

            var fillHex = row.add("edittext", undefined, aeColorToHex(CONFIG.activeSeriesColors[sName].fill));
            fillHex.preferredSize = [70, 20];

            fillSwatch.visible = showFillColumn;
            fillHex.visible = showFillColumn;

            var strokeSwatch = row.add("group", undefined);
            strokeSwatch.preferredSize = [20, 20];
            setElementColor(strokeSwatch, CONFIG.activeSeriesColors[sName].stroke);

            var strokeHex = row.add("edittext", undefined, aeColorToHex(CONFIG.activeSeriesColors[sName].stroke));
            strokeHex.preferredSize = [70, 20];

            strokeSwatch.visible = showStrokeColumn;
            strokeHex.visible = showStrokeColumn;

            fillHex.onChange = (function(name, swatchRef, inputRef) {
                return function() {
                    var testColor = hexToAeColor(inputRef.text);
                    if (testColor !== null) {
                        CONFIG.activeSeriesColors[name].fill = testColor;
                        setElementColor(swatchRef, testColor);
                        inputRef.text = aeColorToHex(testColor);
                    } else {
                        inputRef.text = aeColorToHex(CONFIG.activeSeriesColors[name].fill);
                    }
                };
            })(sName, fillSwatch, fillHex);

            strokeHex.onChange = (function(name, swatchRef, inputRef) {
                return function() {
                    var testColor = hexToAeColor(inputRef.text);
                    if (testColor !== null) {
                        CONFIG.activeSeriesColors[name].stroke = testColor;
                        setElementColor(swatchRef, testColor);
                        inputRef.text = aeColorToHex(testColor);
                    } else {
                        inputRef.text = aeColorToHex(CONFIG.activeSeriesColors[name].stroke);
                    }
                };
            })(sName, strokeSwatch, strokeHex);
        }

        // --- Event Listeners ---

        typeDD.onChange = function() {
            var isLine = typeDD.selection.index === 0;
            if (isLine) {
                lineStyleGrp.visible = true;
                barStyleGrp.visible = false;
                layoutGrp.visible = false;
                stackRow.visible = false;
            } else {
                lineStyleGrp.visible = false;
                barStyleGrp.visible = true;
                layoutGrp.visible = true;
                stackRow.visible = false;
            }
            updateSeriesColorsUI();
            updateTotalSumVisibility();
            win.layout.layout(true);
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
            win.layout.layout(true);
        };

        areaStackChk.onClick = function() {
            updateTotalSumVisibility();
        };

        barStackChk.onClick = function() {
            updateTotalSumVisibility();
        };

        // FIXED: Click listener updated to toggle Area opacity controls dynamically 
        customFillChk.onClick = function() {
            fillOpacityLabel.visible = fillLinesChk.value && customFillChk.value;
            fillOpacityIn.visible = fillLinesChk.value && customFillChk.value;
            updateSeriesColorsUI();
            win.layout.layout(true);
        };

        strokeLinesChk.onClick = updateSeriesColorsUI;
        fillBarsChk.onClick = updateSeriesColorsUI;
        strokeBarsChk.onClick = updateSeriesColorsUI;

        loadBtn.onClick = function() {
            var dChar = resolveDelimiter();
            var rawText = csvInput.text;
            
            if (transposeChk.value) {
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
                    rawText = transposedGrid.join("\n");
                    csvInput.text = rawText; 
                }
            }

            var headers = parseHeaders(rawText, dChar);
            if(!headers.length || headers[0] === "") {
                alert("Please paste valid CSV or Spreadsheet data first.");
                return;
            }
            
            var isWide = formatDD.selection.index === 1;
            
            if (isWide) {
                fill(sDD, [headers[0]]); 
                fill(xDD, ["Year/Time"]); 
                fill(yDD, ["Value"]);
                fill(valueLabelDD, ["(None)"].concat(headers));
            } else {
                fill(xDD, headers);
                fill(yDD, headers);
                fill(sDD, headers);
                fill(valueLabelDD, ["(None)"].concat(headers));
            }

            updateSeriesColorsUI();
            updateTotalSumVisibility();
            tabGroup.selection = tabMapColors;
        };

        sDD.onChange = updateSeriesColorsUI;
        yDD.onChange = updateSeriesColorsUI;

        genBtn.onClick = function(){
            var comp = app.project.activeItem;
            if(!(comp instanceof CompItem)) {
                alert("Please select or open an active Composition first.");
                return;
            }

            var dChar = resolveDelimiter();
            var rawLines = csvInput.text.split(/\r?\n/);
            var raw = [];
            for (var i = 0; i < rawLines.length; i++) {
                var trimmedLine = rawLines[i].replace(/^\s+|\s+$/g, '');
                if (trimmedLine !== "") raw.push(rawLines[i]);
            }

            if (raw.length < 2) {
                alert("Please insert at least 1 header row and 1 data row.");
                return;
            }
            
            var headers = parseHeaders(raw[0], dChar);

            var xVal = safeDD(xDD);
            var yVal = safeDD(yDD);
            var sVal = safeDD(sDD);
            var valueLabelVal = safeDD(valueLabelDD);
            if (valueLabelVal === "(None)") valueLabelVal = null;

            if(!xVal || !yVal) {
                alert("Axis mappings are missing. Please load headers and try again.");
                return;
            }

            var isWideFormat = formatDD.selection.index === 1;
            var normalizedData = [];

            if (isWideFormat) {
                for (var rIdx = 1; rIdx < raw.length; rIdx++) {
                    var rowCells = splitLine(raw[rIdx], dChar);
                    var seriesNameVal = rowCells[0] || ""; 

                    for (var nIdx = 1; nIdx < headers.length; nIdx++) {
                        var colName = headers[nIdx]; 
                        var cellRawValue = rowCells[nIdx];
                        
                        if (cellRawValue === undefined || cellRawValue === null || cellRawValue === "") {
                            continue; 
                        }

                        var obj = {};
                        obj[xVal] = colName;          
                        obj[yVal] = cellRawValue;     
                        obj[sVal] = seriesNameVal;    
                        
                        if (valueLabelVal) {
                            obj["_value_label"] = rowCells[headers.indexOf(valueLabelVal)] || "";
                        }

                        normalizedData.push(obj);
                    }
                }
            } else {
                for(var i=1; i<raw.length; i++){
                    var r = splitLine(raw[i], dChar);
                    var obj = {};
                    for(var j=0; j<headers.length; j++){
                        var key = headers[j];
                        obj[key] = r[j] ? r[j] : "";
                    }
                    if (obj[xVal] !== "" || obj[yVal] !== "") {
                        if (valueLabelVal) {
                            obj["_value_label"] = r[headers.indexOf(valueLabelVal)] || "";
                        }
                        normalizedData.push(obj);
                    }
                }
            }

            if (normalizedData.length === 0) {
                alert("No valid data points resolved. Please verify headers, separator type, and table contents.");
                return;
            }

            var isStackedValue = (typeDD.selection.index === 1) ? barStackChk.value : (fillLinesChk.value && areaStackChk.value);

            app.beginUndoGroup("Generate Animated Chart");
            try {
                drawGraph(
                    comp, 
                    normalizedData, 
                    xVal, 
                    yVal, 
                    sVal, 
                    safeDD(typeDD) || "Line",
                    dotChk.value, 
                    xGridChk.value,           
                    yGridChk.value,           
                    xLabelChk.value, 
                    yLabelChk.value,
                    valueLabelChk.value,
                    num(barWidthInput.text),
                    num(barGapInput.text),
                    fillBarsChk.value,
                    strokeBarsChk.value,
                    strokeLinesChk.value,
                    fillLinesChk.value,
                    fontDD.selection ? fontDD.selection.text : "Helvetica",
                    isStackedValue, 
                    thousandsSepInput.text, 
                    titleInput.text,         
                    safeDD(xTickDD),        
                    safeDD(yTickDD),        
                    num(axisWidthIn.text),  
                    num(gridWidthIn.text),  
                    animateAxesChk.value,
                    num(fontSizeIn.text),     
                    num(strokeWidthIn.text),  
                    legendChk.value,
                    safeDD(legendAlignDD) || "Top Right",
                    customFillChk.value,
                    num(fillOpacityIn.text), // Passed user custom Area Fill opacity
                    valueLabelVal, 
                    yAxisRightChk.value, 
                    safeDD(valueLabelPosDD), 
                    drawTotalSumChk.value,
                    safeDD(legendOrientDD) || "Vertical" 
                );
            } catch (err) {
                alert("An error occurred during generation:\n" + err.toString());
            }
            handledSelectionRestore();
            app.endUndoGroup();
        };

        typeDD.onChange();

        if (win instanceof Window) {
            win.minimumSize = [340, 480];
        }

        return win;
    }

    // ================= GRAPH DRAWING LOGIC =================

    function drawGraph(comp, data, xKey, yKey, sKey, type, dots, drawXAxis, drawYAxis, drawXLabels, drawYLabels, drawValues, customBarWidth, customBarGap, fillBars, strokeBars, strokeLines, fillLines, selectedFont, isStacked, separatorSymbol, graphTitleText, xTickStyle, yTickStyle, strokeWidthAxis, strokeWidthGrid, animateAxes, selectedFontSize, seriesStrokeWidth, drawLegend, legendPosition, customFill, customFillOpacity, valueCustomLabelKey, rightYAxis, valueLabelPos, drawTotalSum, legendOrientation){
        var margin = CONFIG.margin;
        var w = comp.width - margin*2;
        var h = comp.height - margin*2;

        var baseX = rightYAxis ? comp.width - margin : margin;
        var baseY = comp.height - margin;

        var series = {};
        if (selectedFont && selectedFont !== "") {
            CONFIG.fontFamily = selectedFont;
        }

        var currentFontSize = isNaN(selectedFontSize) || selectedFontSize <= 0 ? CONFIG.fontSize : selectedFontSize;
        var currentStrokeWidth = isNaN(seriesStrokeWidth) || seriesStrokeWidth <= 0 ? CONFIG.lineWidth : seriesStrokeWidth;

        var axisStrokeWidth = isNaN(strokeWidthAxis) || strokeWidthAxis <= 0 ? CONFIG.axisWidth : strokeWidthAxis;
        var gridStrokeWidth = isNaN(strokeWidthGrid) || strokeWidthGrid <= 0 ? 1 : strokeWidthGrid;

        var resolvedGridColor = CONFIG.gridColor !== null ? CONFIG.gridColor : CONFIG.axisColor;

        if (type === "Bar" && !fillBars && !strokeBars) fillBars = true;
        if (type === "Line" && !strokeLines && !fillLines) strokeLines = true;

        var barWidthPct = Math.min(Math.max(customBarWidth, 10), 100) / 100;
        var clusterGapPct = Math.min(Math.max(customBarGap, 0), 90) / 100;

        var categories = [];
        var isCategorical = false;

        for (var i = 0; i < data.length; i++) {
            var rawX = data[i][xKey];
            if (rawX === undefined || rawX === null) continue;
            var rawTrimmed = rawX.toString().replace(/^\s+|\s+$/g, '');
            if (categories.indexOf(rawTrimmed) === -1) {
                categories.push(rawTrimmed);
            }
            if (!isNumeric(rawTrimmed)) {
                isCategorical = true;
            }
        }

        if (!isCategorical) {
            categories.sort(function(a, b) { return num(a) - num(b); });
        }

        for(var i=0; i<data.length; i++){
            var rawXVal = data[i][xKey];
            if (rawXVal === undefined || rawXVal === null) continue;
            var rawXClean = rawXVal.toString().replace(/^\s+|\s+$/g, '');

            var g = sKey && data[i][sKey] ? data[i][sKey].toString().replace(/^\s+|\s+$/g, '') : "Series";
            var xv = isCategorical ? categories.indexOf(rawXClean) : num(rawXClean);
            var yv = num(data[i][yKey]);

            if(!series[g]){
                var customColorObj = CONFIG.activeSeriesColors[g] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                series[g] = { 
                    points: [], 
                    fillColor: customColorObj.fill, 
                    strokeColor: customColorObj.stroke 
                };
            }

            series[g].points.push({ 
                x: xv, 
                y: yv, 
                rawX: rawXClean,
                valueLabel: data[i]["_value_label"] !== undefined ? data[i]["_value_label"] : null
            });
        }

        var groupNames = [];
        for(var k in series) {
            groupNames.push(k);
        }

        var rawMaxY = 0;
        var stackTable = {}; 
        for (var c = 0; c < categories.length; c++) {
            var catX = isCategorical ? c : num(categories[c]);
            stackTable[catX] = [];
            for (var g = 0; g < groupNames.length; g++) {
                stackTable[catX][g] = 0; 
            }
        }

        for (var name in series) {
            var gIdx = groupNames.indexOf(name);
            var pts = series[name].points;
            for (var p = 0; p < pts.length; p++) {
                if (stackTable[pts[p].x] !== undefined) {
                    stackTable[pts[p].x][gIdx] = pts[p].y;
                }
            }
        }

        for (var cX in stackTable) {
            var sum = 0;
            for (var g = 0; g < groupNames.length; g++) {
                if (isStacked) {
                    sum += stackTable[cX][g];
                } else {
                    sum = Math.max(sum, stackTable[cX][g]);
                }
            }
            rawMaxY = Math.max(rawMaxY, sum);
        }

        var niceStepY = getNiceStep(rawMaxY, 5);
        var niceMaxY = Math.ceil(rawMaxY / niceStepY) * niceStepY;
        if (niceMaxY === 0) niceMaxY = 1;
        var maxY = niceMaxY;
        var divisionsY = Math.round(niceMaxY / niceStepY);

        var minX = 0;
        var maxX = 0;
        if (isCategorical) {
            minX = 0;
            maxX = categories.length - 1;
        } else {
            var numericCategories = [];
            for (var n = 0; n < categories.length; n++) {
                numericCategories.push(num(categories[n]));
            }
            minX = Math.min.apply(null, numericCategories);
            maxX = Math.max.apply(null, numericCategories);
        }
        if (maxX === minX) maxX = minX + 1; 

        // 1. Draw Axis Lines
        if (drawXAxis || drawYAxis) {
            drawAxis(comp, baseX, baseY, w, h, axisStrokeWidth, animateAxes, drawXAxis, drawYAxis, rightYAxis);
        }

        // 2. Generate a custom decorative title if mapped and specified
        if (graphTitleText && graphTitleText !== "") {
            var titleLayer = createText(comp, graphTitleText, [comp.width / 2, margin / 2], "center", "Graph_Title", currentFontSize * 1.5);
            var tOp = safeProperty(titleLayer, "ADBE Transform Group", 3, "Transform");
            if (tOp) {
                var tOpProp = safeProperty(tOp, "ADBE Opacity", 11, "Opacity");
                if (tOpProp) {
                    var startFade = animateAxes ? 0.5 : 0.0;
                    var endFade = animateAxes ? 1.1 : 0.6;
                    tOpProp.setValueAtTime(startFade, 0);
                    tOpProp.setValueAtTime(endFade, 100);
                }
            }
        }

        // 3. Render Axis Labels + Custom Ticks/Gridlines
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
                    pathObj.vertices = [[x1, y1], [x2, y2]];
                    pathObj.closed = false;
                    var pathProp = safeProperty(lineSegment, "ADBE Vector Shape", 1, "Path");
                    if (pathProp) pathProp.setValue(pathObj);
                }
            }

            // --- DRAW Y-AXIS GRID LINES OR TICKS ---
            for (var d = 0; d <= divisionsY; d++) {
                var val = d * niceStepY;
                var pct = val / maxY;
                var tY = baseY - (pct * h);
                
                if (drawYLabels) {
                    var formattedVal = formatNumber(val, 0, separatorSymbol);
                    
                    var labelXPos = rightYAxis ? baseX + (currentFontSize * 0.7 + 5) : baseX - (currentFontSize * 0.7 + 5);
                    var labelJustify = rightYAxis ? "left" : "right";
                    var labelYPos = tY + (currentFontSize / 3);
                    
                    var labelText = createText(comp, formattedVal, [labelXPos, labelYPos], labelJustify, "Y_Label_" + val, currentFontSize);
                    var op = safeProperty(labelText, "ADBE Transform Group", 3, "Transform");
                    if (op) {
                        var opProp = safeProperty(op, "ADBE Opacity", 11, "Opacity");
                        if (opProp) {
                            var startFade = animateAxes ? 0.8 : 0.0;
                            var endFade = animateAxes ? 1.3 : 0.5;
                            opProp.setValueAtTime(startFade, 0);
                            opProp.setValueAtTime(endFade, 100);
                        }
                    }
                }

                if (ticksGrpContents) {
                    if (yTickStyle === "Full Grid") {
                        makeLineSegment(margin, tY, comp.width - margin, tY, ticksGrpContents, "Y_Grid_" + d);
                    } else if (yTickStyle === "Short Ticks") {
                        var tickOffset = rightYAxis ? 8 : -8;
                        makeLineSegment(baseX + tickOffset, tY, baseX, tY, ticksGrpContents, "Y_Tick_" + d);
                    }
                }
            }

            // --- DRAW X-AXIS GRID LINES OR TICKS ---
            if (isCategorical || type === "Bar") {
                var singleCatW = w / categories.length;
                var labelSkipRatio = Math.ceil(categories.length / 10); 
                for (var c = 0; c < categories.length; c++) {
                    var cVal = categories[c];
                    var cX = margin + (c * singleCatW) + (singleCatW / 2);
                    
                    if (drawXLabels && (c % labelSkipRatio === 0 || c === categories.length - 1)) {
                        var labelYPos = baseY + currentFontSize + 8;
                        var xLabel = createText(comp, cVal.toString(), [cX, labelYPos], "center", "X_Label_" + cVal, currentFontSize);
                        var xOp = safeProperty(xLabel, "ADBE Transform Group", 3, "Transform");
                        if (xOp) {
                            var opProp = safeProperty(xOp, "ADBE Opacity", 11, "Opacity");
                            if (opProp) {
                                var startFade = animateAxes ? 0.8 : 0.0;
                                var endFade = animateAxes ? 1.3 : 0.5;
                                opProp.setValueAtTime(startFade, 0);
                                opProp.setValueAtTime(endFade, 100);
                            }
                        }
                    }

                    if (ticksGrpContents) {
                        if (xTickStyle === "Full Grid") {
                            makeLineSegment(cX, baseY, cX, baseY - h, ticksGrpContents, "X_Grid_" + c);
                        } else if (xTickStyle === "Short Ticks") {
                            makeLineSegment(cX, baseY, cX, baseY + 8, ticksGrpContents, "X_Tick_" + c);
                        }
                    }
                }
            } else {
                var spanX = maxX - minX;
                var niceStepX = getNiceStep(spanX, 5); 
                var startValX = Math.ceil(minX / niceStepX) * niceStepX; 
                var tIndex = 0;

                for (var valX = startValX; valX <= maxX; valX += niceStepX) {
                    var xPct = (valX - minX) / spanX;
                    var cX = margin + (xPct * w);
                    
                    if (drawXLabels) {
                        var labelYPos = baseY + currentFontSize + 8;
                        var xLabel = createText(comp, valX.toString(), [cX, labelYPos], "center", "X_Label_" + valX, currentFontSize);
                        var xOp = safeProperty(xLabel, "ADBE Transform Group", 3, "Transform");
                        if (xOp) {
                            var opProp = safeProperty(xOp, "ADBE Opacity", 11, "Opacity");
                            if (opProp) {
                                var startFade = animateAxes ? 0.8 : 0.0;
                                var endFade = animateAxes ? 1.3 : 0.5;
                                opProp.setValueAtTime(startFade, 0);
                                opProp.setValueAtTime(endFade, 100);
                            }
                        }
                    }

                    if (ticksGrpContents) {
                        if (xTickStyle === "Full Grid") {
                            makeLineSegment(cX, baseY, cX, baseY - h, ticksGrpContents, "X_Grid_" + tIndex);
                        } else if (xTickStyle === "Short Ticks") {
                            makeLineSegment(cX, baseY, cX, baseY + 8, ticksGrpContents, "X_Tick_" + tIndex);
                        }
                    }
                    tIndex++;
                }
            }

            if (ticksGrpContents && (xTickStyle !== "None" || yTickStyle !== "None")) {
                var stroke = ticksGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                if (stroke) {
                    var strokeCol = safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color");
                    if (strokeCol) strokeCol.setValue(resolvedGridColor);
                    var strokeWidth = safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                    if (strokeWidth) strokeWidth.setValue(gridStrokeWidth);
                    var strokeCap = safeProperty(stroke, "ADBE Vector Stroke Line Cap", 6, "Line Cap");
                    if (strokeCap) strokeCap.setValue(3); 
                }
                
                if (animateAxes) {
                    var trim = ticksGrpContents.addProperty("ADBE Vector Filter - Trim");
                    if (trim) {
                        var trimEnd = safeProperty(trim, "ADBE Vector Trim End", 2, "End");
                        if (trimEnd) {
                            trimEnd.setValueAtTime(0, 0);
                            trimEnd.setValueAtTime(1.2, 100);
                        }
                    }
                }
            }
        }

        // 4. Render Series Data Paths / Bars
        for(var name in series){
            var pts = series[name].points;
            pts.sort(function(a,b){return a.x - b.x;});

            var groupIndex = groupNames.indexOf(name);
            var seriesFillColor = series[name].fillColor;
            var seriesStrokeColor = series[name].strokeColor;
            
            if (type === "Bar") {
                var singleCatW = w / categories.length; 
                
                // Stacked Bar Calculation
                if (isStacked) {
                    var barW = singleCatW * barWidthPct;

                    for(var p=0; p<pts.length; p++){
                        var idx = categories.indexOf(pts[p].rawX);
                        if (idx === -1) idx = 0;

                        var priorSum = 0;
                        for (var pre = 0; pre < groupIndex; pre++) {
                            priorSum += stackTable[pts[p].x][pre];
                        }

                        var px = margin + (idx * singleCatW) + (singleCatW / 2);
                        var hVal = (pts[p].y / maxY) * h;
                        var baseOffset = (priorSum / maxY) * h;
                        if (hVal <= 0) hVal = 2;

                        var barName = name + "_Bar_" + idx; 
                        var bar = makeShapeLayer(comp, barName);
                        var trans = safeProperty(bar, "ADBE Transform Group", 3, "Transform");
                        if (trans) {
                            var ap = safeProperty(trans, "ADBE Anchor Point", 1, "Anchor Point");
                            if (ap) ap.setValue([0, 0]); 
                            
                            var positionProp = safeProperty(trans, "ADBE Position", 2, "Position");
                            if (positionProp) {
                                positionProp.setValue([px, baseY - baseOffset]);

                                if (groupIndex > 0) {
                                    var prevLayerName = groupNames[groupIndex - 1] + "_Bar_" + idx; 
                                    positionProp.expression = 
                                        "try {\n" +
                                        "    var L = thisComp.layer(\"" + prevLayerName + "\");\n" +
                                        "    var L_pos = L.transform.position;\n" +
                                        "    var topEdge = L.sourceRectAtTime(time, false).top;\n" +
                                        "    [value[0], L_pos[1] + topEdge];\n" +
                                        "} catch(err) {\n" +
                                        "    value;\n" +
                                        "}";
                                }
                            }
                        }

                        var contents = safeProperty(bar, "ADBE Root Vectors Group", 2, "Contents");
                        if (contents) {
                            var fillGrp = contents.addProperty("ADBE Vector Group");
                            fillGrp.name = "Fill_Group";
                            
                            var fillGrpTrans = safeProperty(fillGrp, "ADBE Vector Transform Group", 3, "Transform");
                            if (fillGrpTrans) {
                                var fillGrpAP = safeProperty(fillGrpTrans, "ADBE Vector Anchor Point", 1, "Anchor Point");
                                if (fillGrpAP) fillGrpAP.setValue([0, 0]);
                                
                                var fillGrpPos = safeProperty(fillGrpTrans, "ADBE Vector Position", 2, "Position");
                                if (fillGrpPos) fillGrpPos.setValue([0, 0]);
                                
                                var fillGrpScale = safeProperty(fillGrpTrans, "ADBE Vector Scale", 3, "Scale");
                                if (fillGrpScale) {
                                    var staggerDelay = (idx * 0.1) + (groupIndex * 0.05);
                                    fillGrpScale.setValueAtTime(staggerDelay, [100, 0]);
                                    fillGrpScale.setValueAtTime(staggerDelay + 1.2, [100, 100]);
                                    
                                    var easeOut = new KeyframeEase(0, 33);
                                    var easeIn = new KeyframeEase(0, 33);
                                    fillGrpScale.setTemporalEaseAtKey(1, [easeOut, easeOut], [easeIn, easeIn]);
                                    fillGrpScale.setTemporalEaseAtKey(2, [easeOut, easeOut], [easeIn, easeIn]);
                                }

                                var fillGrpOpacity = safeProperty(fillGrpTrans, "ADBE Vector Opacity", 4, "Opacity");
                                if (fillGrpOpacity) {
                                    fillGrpOpacity.expression = "transform.scale[1] < 0.1 ? 0 : value;";
                                }
                            }

                            var fillGrpContents = safeProperty(fillGrp, "ADBE Vectors Group", 2, "Contents");
                            if (fillGrpContents) {
                                var rect = fillGrpContents.addProperty("ADBE Vector Shape - Rect");
                                rect.name = "Rect_Path";
                                
                                var sizeProp = safeProperty(rect, "ADBE Vector Rect Size", 1, "Size");
                                if (sizeProp) {
                                    sizeProp.setValue([barW, hVal]);
                                }

                                var rectPos = safeProperty(rect, "ADBE Vector Rect Position", 2, "Position");
                                if (rectPos) {
                                    rectPos.expression = "[0, -thisProperty.propertyGroup(1)(\"ADBE Vector Rect Size\")[1] / 2];";
                                }

                                if (fillBars) {
                                    var fill = fillGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                    if (fill) {
                                        var fillCol = safeProperty(fill, "ADBE Vector Fill Color", 4, "Color");
                                        if (fillCol) fillCol.setValue(seriesFillColor);
                                    }
                                }
                            }

                            if (strokeBars) {
                                var strokeGrp = contents.addProperty("ADBE Vector Group");
                                strokeGrp.name = "Stroke_Group";
                                
                                var strokeGrpTrans = safeProperty(strokeGrp, "ADBE Vector Transform Group", 3, "Transform");
                                if (strokeGrpTrans) {
                                    var strokeGrpAP = safeProperty(strokeGrpTrans, "ADBE Vector Anchor Point", 1, "Anchor Point");
                                    if (strokeGrpAP) strokeGrpAP.setValue([0, 0]);
                                    
                                    var strokeGrpPos = safeProperty(strokeGrpTrans, "ADBE Vector Position", 2, "Position");
                                    if (strokeGrpPos) strokeGrpPos.setValue([0, 0]);

                                    var strokeGrpOpacity = safeProperty(strokeGrpTrans, "ADBE Vector Opacity", 4, "Opacity");
                                    if (strokeGrpOpacity) {
                                        strokeGrpOpacity.expression = 
                                            "try {\n" +
                                            "    var h = content(\"Stroke_Group\").content(\"Stroke_Rect_Path\").size[1];\n" +
                                            "    h < 0.1 ? 0 : value;\n" +
                                            "} catch (err) {\n" +
                                            "    value;\n" +
                                            "}";
                                    }
                                }

                                var strokeGrpContents = safeProperty(strokeGrp, "ADBE Vectors Group", 2, "Contents");
                                if (strokeGrpContents) {
                                    var strokeRect = strokeGrpContents.addProperty("ADBE Vector Shape - Rect");
                                    strokeRect.name = "Stroke_Rect_Path";
                                    
                                    var strokeSizeProp = safeProperty(strokeRect, "ADBE Vector Rect Size", 1, "Size");
                                    if (strokeSizeProp) {
                                        var staggerDelay = (idx * 0.1) + (groupIndex * 0.05);
                                        strokeSizeProp.setValueAtTime(staggerDelay, [barW, 0]);
                                        strokeSizeProp.setValueAtTime(staggerDelay + 1.2, [barW, hVal]);
                                        
                                        var easeOut = new KeyframeEase(0, 33);
                                        var easeIn = new KeyframeEase(0, 33);
                                        strokeSizeProp.setTemporalEaseAtKey(1, [easeOut, easeOut], [easeIn, easeIn]);
                                        strokeSizeProp.setTemporalEaseAtKey(2, [easeOut, easeOut], [easeIn, easeIn]);
                                    }

                                    var strokeRectPos = safeProperty(strokeRect, "ADBE Vector Rect Position", 2, "Position");
                                    if (strokeRectPos) {
                                        strokeRectPos.expression = "[0, -thisProperty.propertyGroup(1)(\"ADBE Vector Rect Size\")[1] / 2];";
                                    }

                                    var stroke = strokeGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                    if (stroke) {
                                        var strokeCol = safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color");
                                        if (strokeCol) strokeCol.setValue(seriesStrokeColor);
                                        var strokeWidth = safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                                        if (strokeWidth) strokeWidth.setValue(currentStrokeWidth);
                                    }
                                }
                            }
                        }

                        // Display values with dynamic centering adjustments (Supporting CUSTOM value labels)
                        if (drawValues) {
                            var isCentered = valueLabelPos === "Center of Bar";
                            var valueYPos = isCentered 
                                ? baseY - baseOffset - (hVal / 2) + (currentFontSize / 3)
                                : baseY - baseOffset - hVal - (currentFontSize * 0.5 + 4);
                            
                            // Value label column now falls back to formatting raw Y numerical value if empty string, null, or undefined
                            var hasValueLabelVal = pts[p].valueLabel !== null && pts[p].valueLabel !== undefined && pts[p].valueLabel !== "";
                            var labelTextString = hasValueLabelVal ? pts[p].valueLabel : formatNumber(pts[p].y, 0, separatorSymbol);
                            var valText = createText(comp, labelTextString, [px, valueYPos], "center", "Val_" + name + "_" + idx, currentFontSize); 
                            
                            var vTrans = safeProperty(valText, "ADBE Transform Group", 3, "Transform");
                            if (vTrans) {
                                var valTextPos = safeProperty(vTrans, "ADBE Position", 2, "Position");
                                if (valTextPos) {
                                    if (isCentered) {
                                        // Dynamic Expression: Centers label inside the active height of the Segment
                                        valTextPos.expression = 
                                            "try {\n" +
                                            "    var L = thisComp.layer(\"" + barName + "\");\n" +
                                            "    var L_pos = L.transform.position;\n" +
                                            "    var segmentH = L.sourceRectAtTime(time, false).height;\n" +
                                            "    var topEdge = L.sourceRectAtTime(time, false).top;\n" +
                                            "    [value[0], L_pos[1] + topEdge + (segmentH / 2) + " + (currentFontSize / 4) + "];\n" +
                                            "} catch(err) {\n" +
                                            "    value;\n" +
                                            "}";
                                    } else {
                                        valTextPos.expression = 
                                            "try {\n" +
                                            "    var L = thisComp.layer(\"" + barName + "\");\n" +
                                            "    var L_pos = L.transform.position;\n" +
                                            "    var topEdge = L.sourceRectAtTime(time, false).top;\n" +
                                            "    [value[0], L_pos[1] + topEdge - " + (currentFontSize * 0.5 + 4) + "];\n" +
                                            "} catch(err) {\n" +
                                            "    value;\n" +
                                            "}";
                                    }
                                }

                                var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                                if (vOp) {
                                    vOp.setValueAtTime(staggerDelay + 0.5, 0);
                                    vOp.setValueAtTime(staggerDelay + 1.0, 100);
                                }
                            }
                        }

                        // Total Sum Label generated above the top stacked segment
                        if (drawTotalSum && groupIndex === groupNames.length - 1) {
                            var totalHeightSum = 0;
                            for (var gSum = 0; gSum < groupNames.length; gSum++) {
                                totalHeightSum += stackTable[pts[p].x][gSum];
                            }
                            
                            var sumYPos = baseY - ((totalHeightSum / maxY) * h) - (currentFontSize * 0.5 + 8);
                            var formattedSum = formatNumber(totalHeightSum, 0, separatorSymbol);
                            var sumTextLayer = createText(comp, formattedSum, [px, sumYPos], "center", "TotalSum_Bar_" + idx, currentFontSize);
                            
                            var sTrans = safeProperty(sumTextLayer, "ADBE Transform Group", 3, "Transform");
                            if (sTrans) {
                                var sPos = safeProperty(sTrans, "ADBE Position", 2, "Position");
                                if (sPos) {
                                    sPos.expression = 
                                        "try {\n" +
                                        "    var L = thisComp.layer(\"" + barName + "\");\n" +
                                        "    var L_pos = L.transform.position;\n" +
                                        "    var topEdge = L.sourceRectAtTime(time, false).top;\n" +
                                        "    [value[0], L_pos[1] + topEdge - " + (currentFontSize * 0.5 + 8) + "];\n" +
                                        "} catch(err) {\n" +
                                        "    value;\n" +
                                        "}";
                                }
                                var sOp = safeProperty(sTrans, "ADBE Opacity", 11, "Opacity");
                                if (sOp) {
                                    sOp.setValueAtTime(staggerDelay + 0.6, 0);
                                    sOp.setValueAtTime(staggerDelay + 1.1, 100);
                                }
                            }
                        }
                    }
                } else {
                    // Grouped side-by-side layout rendering
                    var usableWidth = singleCatW * (1 - clusterGapPct); 
                    var barW = (usableWidth * barWidthPct) / groupNames.length;
                    var groupSpacing = groupNames.length > 1 ? (usableWidth * (1 - barWidthPct)) / (groupNames.length - 1) : 0;

                    for(var p=0; p<pts.length; p++){
                        var idx = categories.indexOf(pts[p].rawX);
                        if (idx === -1) idx = 0;
                        
                        var clusterLeft = margin + (idx * singleCatW) + (singleCatW * clusterGapPct / 2);
                        var px = clusterLeft + (groupIndex * (barW + groupSpacing)) + (barW / 2);
                        var hVal = (pts[p].y / maxY) * h;
                        if (hVal <= 0) hVal = 2;

                        var barName = name + "_Bar_" + idx; 
                        var bar = makeShapeLayer(comp, barName);
                        var trans = safeProperty(bar, "ADBE Transform Group", 3, "Transform");
                        if (trans) {
                            var ap = safeProperty(trans, "ADBE Anchor Point", 1, "Anchor Point");
                            if (ap) ap.setValue([0, 0]); 
                            var positionProp = safeProperty(trans, "ADBE Position", 2, "Position");
                            if (positionProp) positionProp.setValue([px, baseY]);
                        }

                        var contents = safeProperty(bar, "ADBE Root Vectors Group", 2, "Contents");
                        if (contents) {
                            var fillGrp = contents.addProperty("ADBE Vector Group");
                            fillGrp.name = "Fill_Group";
                            
                            var fillGrpTrans = safeProperty(fillGrp, "ADBE Vector Transform Group", 3, "Transform");
                            if (fillGrpTrans) {
                                var fillGrpAP = safeProperty(fillGrpTrans, "ADBE Vector Anchor Point", 1, "Anchor Point");
                                if (fillGrpAP) fillGrpAP.setValue([0, 0]);
                                
                                var fillGrpPos = safeProperty(fillGrpTrans, "ADBE Vector Position", 2, "Position");
                                if (fillGrpPos) fillGrpPos.setValue([0, 0]);
                                
                                var fillGrpScale = safeProperty(fillGrpTrans, "ADBE Vector Scale", 3, "Scale");
                                if (fillGrpScale) {
                                    var staggerDelay = (idx * 0.1) + (groupIndex * 0.05);
                                    fillGrpScale.setValueAtTime(staggerDelay, [100, 0]);
                                    fillGrpScale.setValueAtTime(staggerDelay + 1.2, [100, 100]);
                                    
                                    var easeOut = new KeyframeEase(0, 33);
                                    var easeIn = new KeyframeEase(0, 33);
                                    fillGrpScale.setTemporalEaseAtKey(1, [easeOut, easeOut], [easeIn, easeIn]);
                                    fillGrpScale.setTemporalEaseAtKey(2, [easeOut, easeOut], [easeIn, easeIn]);
                                }

                                var fillGrpOpacity = safeProperty(fillGrpTrans, "ADBE Vector Opacity", 4, "Opacity");
                                if (fillGrpOpacity) {
                                    fillGrpOpacity.expression = "transform.scale[1] < 0.1 ? 0 : value;";
                                }
                            }

                            var fillGrpContents = safeProperty(fillGrp, "ADBE Vectors Group", 2, "Contents");
                            if (fillGrpContents) {
                                var rect = fillGrpContents.addProperty("ADBE Vector Shape - Rect");
                                rect.name = "Rect_Path";
                                
                                var sizeProp = safeProperty(rect, "ADBE Vector Rect Size", 1, "Size");
                                if (sizeProp) {
                                    sizeProp.setValue([barW, hVal]);
                                }

                                var rectPos = safeProperty(rect, "ADBE Vector Rect Position", 2, "Position");
                                if (rectPos) {
                                    rectPos.expression = "[0, -thisProperty.propertyGroup(1)(\"ADBE Vector Rect Size\")[1] / 2];";
                                }

                                if (fillBars) {
                                    var fill = fillGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                    if (fill) {
                                        var fillCol = safeProperty(fill, "ADBE Vector Fill Color", 4, "Color");
                                        if (fillCol) fillCol.setValue(seriesFillColor);
                                    }
                                }
                            }

                            if (strokeBars) {
                                var strokeGrp = contents.addProperty("ADBE Vector Group");
                                strokeGrp.name = "Stroke_Group";
                                
                                var strokeGrpTrans = safeProperty(strokeGrp, "ADBE Vector Transform Group", 3, "Transform");
                                if (strokeGrpTrans) {
                                    var strokeGrpAP = safeProperty(strokeGrpTrans, "ADBE Vector Anchor Point", 1, "Anchor Point");
                                    if (strokeGrpAP) strokeGrpAP.setValue([0, 0]);
                                    
                                    var strokeGrpPos = safeProperty(strokeGrpTrans, "ADBE Vector Position", 2, "Position");
                                    if (strokeGrpPos) strokeGrpPos.setValue([0, 0]);

                                    var strokeGrpOpacity = safeProperty(strokeGrpTrans, "ADBE Vector Opacity", 4, "Opacity");
                                    if (strokeGrpOpacity) {
                                        strokeGrpOpacity.expression = 
                                            "try {\n" +
                                            "    var h = content(\"Stroke_Group\").content(\"Stroke_Rect_Path\").size[1];\n" +
                                            "    h < 0.1 ? 0 : value;\n" +
                                            "} catch (err) {\n" +
                                            "    value;\n" +
                                            "}";
                                    }
                                }

                                var strokeGrpContents = safeProperty(strokeGrp, "ADBE Vectors Group", 2, "Contents");
                                if (strokeGrpContents) {
                                    var strokeRect = strokeGrpContents.addProperty("ADBE Vector Shape - Rect");
                                    strokeRect.name = "Stroke_Rect_Path";
                                    
                                    var strokeSizeProp = safeProperty(strokeRect, "ADBE Vector Rect Size", 1, "Size");
                                    if (strokeSizeProp) {
                                        var staggerDelay = (idx * 0.1) + (groupIndex * 0.05);
                                        strokeSizeProp.setValueAtTime(staggerDelay, [barW, 0]);
                                        strokeSizeProp.setValueAtTime(staggerDelay + 1.2, [barW, hVal]);
                                        
                                        var easeOut = new KeyframeEase(0, 33);
                                        var easeIn = new KeyframeEase(0, 33);
                                        strokeSizeProp.setTemporalEaseAtKey(1, [easeOut, easeOut], [easeIn, easeIn]);
                                        strokeSizeProp.setTemporalEaseAtKey(2, [easeOut, easeOut], [easeIn, easeIn]);
                                    }

                                    var strokeRectPos = safeProperty(strokeRect, "ADBE Vector Rect Position", 2, "Position");
                                    if (strokeRectPos) {
                                        strokeRectPos.expression = "[0, -thisProperty.propertyGroup(1)(\"ADBE Vector Rect Size\")[1] / 2];";
                                    }

                                    var stroke = strokeGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                    if (stroke) {
                                        var strokeCol = safeProperty(stroke, "ADBE Vector Stroke Color", 4, "Color");
                                        if (strokeCol) strokeCol.setValue(seriesStrokeColor);
                                        var strokeWidth = safeProperty(stroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                                        if (strokeWidth) strokeWidth.setValue(currentStrokeWidth);
                                    }
                                }
                            }
                        }

                        if (drawValues) {
                            var isCentered = valueLabelPos === "Center of Bar";
                            var valueYPos = isCentered 
                                ? baseY - (hVal / 2) + (currentFontSize / 3)
                                : baseY - hVal - (currentFontSize * 0.5 + 4);
                            
                            var labelTextString = pts[p].valueLabel !== null ? pts[p].valueLabel : formatNumber(pts[p].y, 0, separatorSymbol);
                            var valText = createText(comp, labelTextString, [px, valueYPos], "center", "Val_" + name + "_" + idx, currentFontSize); 
                            var vTrans = safeProperty(valText, "ADBE Transform Group", 3, "Transform");
                            if (vTrans) {
                                var valTextPos = safeProperty(vTrans, "ADBE Position", 2, "Position");
                                if (valTextPos) {
                                    if (isCentered) {
                                        valTextPos.expression = 
                                            "try {\n" +
                                            "    var L = thisComp.layer(\"" + barName + "\");\n" +
                                            "    var L_pos = L.transform.position;\n" +
                                            "    var segmentH = L.sourceRectAtTime(time, false).height;\n" +
                                            "    var topEdge = L.sourceRectAtTime(time, false).top;\n" +
                                            "    [value[0], L_pos[1] + topEdge + (segmentH / 2) + " + (currentFontSize / 4) + "];\n" +
                                            "} catch(err) {\n" +
                                            "    value;\n" +
                                            "}";
                                    } else {
                                        valTextPos.expression = 
                                            "try {\n" +
                                            "    var L = thisComp.layer(\"" + barName + "\");\n" +
                                            "    var L_pos = L.transform.position;\n" +
                                            "    var topEdge = L.sourceRectAtTime(time, false).top;\n" +
                                            "    [value[0], L_pos[1] + topEdge - " + (currentFontSize * 0.5 + 4) + "];\n" +
                                            "} catch(err) {\n" +
                                            "    value;\n" +
                                            "}";
                                    }
                                }

                                var vOp = safeProperty(vTrans, "ADBE Opacity", 11, "Opacity");
                                if (vOp) {
                                    vOp.setValueAtTime(staggerDelay + 0.5, 0);
                                    vOp.setValueAtTime(staggerDelay + 1.0, 100);
                                }
                            }
                        }
                    }
                }
            } else {
                // Line Graph layout pathing
                var lineLayer = makeShapeLayer(comp, name + "_Line_Group");
                var lineContents = safeProperty(lineLayer, "ADBE Root Vectors Group", 2, "Contents");
                
                var shapeVerts = [];
                var baselineVerts = []; 

                for (var p = 0; p < pts.length; p++) {
                    var idx = categories.indexOf(pts[p].rawX);
                    if (idx === -1) idx = 0;

                    var xPct = 0;
                    if (isCategorical) {
                        xPct = (idx / (categories.length - 1));
                    } else {
                        xPct = (pts[p].x - minX) / (maxX - minX);
                    }
                    
                    var priorSum = 0;
                    if (isStacked) {
                        var priorMax = Math.min(groupIndex, groupNames.length);
                        for (var pre = 0; pre < priorMax; pre++) {
                            priorSum += stackTable[pts[p].x][pre];
                        }
                    }

                    var cumulativeYVal = pts[p].y + priorSum;
                    var yPct = cumulativeYVal / maxY;
                    var basePct = priorSum / maxY;

                    var px = margin + (xPct * w);
                    var py = baseY - (yPct * h);
                    var pBaseY = baseY - (basePct * h);

                    shapeVerts.push([px, py]);
                    baselineVerts.push([px, pBaseY]);

                    if (dots) {
                        var dot = makeShapeLayer(comp, name + "_Dot_" + idx); 
                        var dTrans = safeProperty(dot, "ADBE Transform Group", 3, "Transform");
                        if (dTrans) {
                            var dPos = safeProperty(dTrans, "ADBE Position", 2, "Position");
                            if (dPos) dPos.setValue([px, py]);
                        }

                        var dotContents = safeProperty(dot, "ADBE Root Vectors Group", 2, "Contents");
                        if (dotContents) {
                            var dotGrp = dotContents.addProperty("ADBE Vector Group");
                            var dotGrpContents = safeProperty(dotGrp, "ADBE Vectors Group", 2, "Contents");
                            if (dotGrpContents) {
                                var circle = dotGrpContents.addProperty("ADBE Vector Shape - Ellipse");
                                if (circle) {
                                    var circleSize = safeProperty(circle, "ADBE Vector Ellipse Size", 1, "Size");
                                    var dotDimension = currentStrokeWidth * 2.5 + 4;
                                    if (circleSize) circleSize.setValue([dotDimension, dotDimension]);
                                }

                                var dotFill = dotGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                if (dotFill) {
                                    var fillCol = safeProperty(dotFill, "ADBE Vector Fill Color", 4, "Color");
                                    if (fillCol) fillCol.setValue(seriesStrokeColor);
                                }
                            }
                        }

                        if (dTrans) {
                            var dotScale = safeProperty(dTrans, "ADBE Scale", 3, "Scale");
                            if (dotScale) {
                                var dotDelay = (idx / categories.length) * 1.2;
                                dotScale.setValueAtTime(dotDelay, [0, 0, 100]);
                                dotScale.setValueAtTime(dotDelay + 0.3, [100, 100, 100]);
                            }
                        }
                    }

                    if (drawValues) {
                        var valueYPos = py - (dots ? currentFontSize * 0.8 + 4 : currentFontSize * 0.6);
                        var lvPos = [px, valueYPos];
                        
                        var labelTextString = pts[p].valueLabel !== null ? pts[p].valueLabel : formatNumber(pts[p].y, 0, separatorSymbol);
                        var lValText = createText(comp, labelTextString, lvPos, "center", "Val_Node_" + name + "_" + idx, currentFontSize); 
                        var lvTrans = safeProperty(lValText, "ADBE Transform Group", 3, "Transform");
                        if (lvTrans) {
                            var lvOp = safeProperty(lvTrans, "ADBE Opacity", 11, "Opacity");
                            if (lvOp) {
                                var lDelay = (idx / categories.length) * 1.2;
                                lvOp.setValueAtTime(lDelay + 0.2, 0);
                                lvOp.setValueAtTime(lDelay + 0.6, 100);
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

                            if (isStacked) {
                                for (var v = 0; v < shapeVerts.length; v++) {
                                    areaVerts.push(shapeVerts[v]);
                                }
                                for (var v = baselineVerts.length - 1; v >= 0; v--) {
                                    areaVerts.push(baselineVerts[v]);
                                }
                            } else {
                                areaVerts.push([shapeVerts[0][0], baseY]);
                                for (var v = 0; v < shapeVerts.length; v++) {
                                    areaVerts.push(shapeVerts[v]);
                                }
                                areaVerts.push([shapeVerts[shapeVerts.length - 1][0], baseY]);
                            }

                            areaMyShape.vertices = areaVerts;
                            areaMyShape.closed = true;
                            if (areaShape) {
                                var pathProp = safeProperty(areaShape, "ADBE Vector Shape", 1, "Path");
                                if (pathProp) pathProp.setValue(areaMyShape);
                            }

                            var areaFill = areaGrpContents.addProperty("ADBE Vector Graphic - Fill");
                            if (areaFill) {
                                var fillCol = safeProperty(areaFill, "ADBE Vector Fill Color", 4, "Color");
                                if (fillCol) {
                                    fillCol.setValue(customFill ? seriesFillColor : seriesStrokeColor);
                                }
                            }
                            
                            var areaTrans = safeProperty(areaGrp, "ADBE Vector Transform Group", 3, "Transform");
                            if (areaTrans) {
                                var areaOp = safeProperty(areaTrans, "ADBE Vector Opacity", 7, "Opacity");
                                if (areaOp) {
                                    // FIXED: Parses and applies user customizable fill opacity value
                                    var areaOpacityValue = isNaN(customFillOpacity) ? 30 : Math.min(Math.max(customFillOpacity, 0), 100);
                                    areaOp.setValueAtTime(0, 0);
                                    areaOp.setValueAtTime(1.5, areaOpacityValue);
                                }
                            }
                        }
                    }

                    if (strokeLines) {
                        var strokeGrp = lineContents.addProperty("ADBE Vector Group");
                        strokeGrp.name = "Stroke_Line_Group";
                        var strokeGrpContents = safeProperty(strokeGrp, "ADBE Vectors Group", 2, "Contents");
                        if (strokeGrpContents) {
                            var lineShape = strokeGrpContents.addProperty("ADBE Vector Shape - Group");
                            var myShape = new Shape();
                            myShape.vertices = shapeVerts;
                            myShape.closed = false;
                            if (lineShape) {
                                var pathProp = safeProperty(lineShape, "ADBE Vector Shape", 1, "Path");
                                if (pathProp) pathProp.setValue(myShape);
                            }

                            var lineStroke = strokeGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                            if (lineStroke) {
                                var strokeCol = safeProperty(lineStroke, "ADBE Vector Stroke Color", 4, "Color");
                                if (strokeCol) strokeCol.setValue(seriesStrokeColor);
                                var strokeWidth = safeProperty(lineStroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                                if (strokeWidth) strokeWidth.setValue(currentStrokeWidth); 
                            }

                            var trim = strokeGrpContents.addProperty("ADBE Vector Filter - Trim");
                            if (trim) {
                                var trimEnd = safeProperty(trim, "ADBE Vector Trim End", 2, "End");
                                if (trimEnd) {
                                    trimEnd.setValueAtTime(0, 0);
                                    trimEnd.setValueAtTime(1.5, 100);

                                    var easeOut = new KeyframeEase(0, 33.333);
                                    var easeIn = new KeyframeEase(0, 33.333);
                                    trimEnd.setTemporalEaseAtKey(1, [easeOut], [easeIn]);
                                    trimEnd.setTemporalEaseAtKey(2, [easeOut], [easeIn]);
                                }
                            }
                        }
                    }
                }
            }
        }

        // ================= DYNAMIC VECTOR LEGEND SYSTEM =================
        if (drawLegend && groupNames.length > 0) {
            var legendLayer = makeShapeLayer(comp, "Graph_Legend");
            var legendContents = safeProperty(legendLayer, "ADBE Root Vectors Group", 2, "Contents");

            if (legendContents) {
                var legendItemHeight = currentFontSize * 1.5;
                
                var alignText = "right";
                var symbolDirection = 1; 
                var legendXStart = comp.width - margin - 30;
                var legendYStart = margin + (margin / 3);

                if (legendPosition === "Top Left") {
                    if (rightYAxis) {
                        legendXStart = margin + 15;
                    } else {
                        legendXStart = margin + (currentFontSize * 3.5);
                    }
                    alignText = "left";
                    symbolDirection = -1;
                } else if (legendPosition === "Bottom Left") {
                    if (rightYAxis) {
                        legendXStart = margin + 15;
                    } else {
                        legendXStart = margin + (currentFontSize * 3.5);
                    }
                    alignText = "left";
                    symbolDirection = -1;
                    
                    if (legendOrientation === "Horizontal") {
                        legendYStart = comp.height - margin - (currentFontSize * 1.5) - (margin / 3);
                    } else {
                        legendYStart = comp.height - margin - (groupNames.length * legendItemHeight) - (margin / 3);
                    }
                } else if (legendPosition === "Top Right") {
                    if (rightYAxis) {
                        legendXStart = comp.width - margin - (currentFontSize * 3.5);
                    } else {
                        legendXStart = comp.width - margin - 15;
                    }
                    alignText = "right";
                    symbolDirection = 1;
                } else if (legendPosition === "Bottom Right") {
                    if (rightYAxis) {
                        legendXStart = comp.width - margin - (currentFontSize * 3.5);
                    } else {
                        legendXStart = comp.width - margin - 15;
                    }
                    alignText = "right";
                    symbolDirection = 1;
                    
                    if (legendOrientation === "Horizontal") {
                        legendYStart = comp.height - margin - (currentFontSize * 1.5) - (margin / 3);
                    } else {
                        legendYStart = comp.height - margin - (groupNames.length * legendItemHeight) - (margin / 3);
                    }
                }

                var itemWidths = [];
                var totalHorizontalWidth = 0;
                if (legendOrientation === "Horizontal") {
                    for (var g = 0; g < groupNames.length; g++) {
                        var sName = groupNames[g];
                        var itemW = (sName.length * currentFontSize * 0.55) + (currentFontSize * 2.2);
                        itemWidths.push(itemW);
                        totalHorizontalWidth += itemW;
                    }
                    if (alignText === "right") {
                        legendXStart = legendXStart - totalHorizontalWidth + (currentFontSize * 1.2); 
                    }
                }

                var currentX = legendXStart;

                for (var gIdx = 0; gIdx < groupNames.length; gIdx++) {
                    var sName = groupNames[gIdx];
                    var seriesColorObj = CONFIG.activeSeriesColors[sName] || { fill: CONFIG.defaultFillPalette[0], stroke: CONFIG.defaultStrokePalette[0] };
                    
                    var itemYOffset = legendYStart;
                    var itemXOffset = currentX;
                    var itemJustify = alignText;

                    if (legendOrientation === "Horizontal") {
                        itemYOffset = legendYStart;
                        itemJustify = "left"; 
                    } else {
                        itemYOffset = legendYStart + (gIdx * legendItemHeight);
                        itemXOffset = legendXStart;
                    }

                    var textDrawX = itemXOffset;
                    if (legendOrientation === "Horizontal") {
                        textDrawX = itemXOffset + (currentFontSize * 1.2); 
                    }

                    var itemText = createText(comp, sName, [textDrawX, itemYOffset + (currentFontSize / 4)], itemJustify, "LegendText_" + sName, currentFontSize);
                    
                    var textOp = safeProperty(itemText, "ADBE Transform Group", 3, "Transform");
                    if (textOp) {
                        var textOpProp = safeProperty(textOp, "ADBE Opacity", 11, "Opacity");
                        if (textOpProp) {
                            var fadeStart = animateAxes ? 0.9 + (gIdx * 0.1) : 0.0;
                            var fadeEnd = animateAxes ? 1.4 + (gIdx * 0.1) : 0.5;
                            textOpProp.setValueAtTime(fadeStart, 0);
                            textOpProp.setValueAtTime(fadeEnd, 100);
                        }
                    }

                    var symbolGrp = legendContents.addProperty("ADBE Vector Group");
                    symbolGrp.name = "Symbol_" + sName;
                    var symbolGrpContents = safeProperty(symbolGrp, "ADBE Vectors Group", 2, "Contents");

                    if (symbolGrpContents) {
                        var symbolCenterX = itemXOffset;
                        if (legendOrientation === "Horizontal") {
                            symbolCenterX = itemXOffset + (currentFontSize * 0.4);
                        } else {
                            symbolCenterX = legendXStart + (symbolDirection * (currentFontSize * 0.8));
                        }
                        var symbolCenterY = itemYOffset;

                        var symTrans = safeProperty(symbolGrp, "ADBE Vector Transform Group", 3, "Transform");
                        if (symTrans) {
                            var symPos = safeProperty(symTrans, "ADBE Vector Position", 2, "Position");
                            if (symPos) symPos.setValue([symbolCenterX, symbolCenterY]);
                        }

                        var useBlockLegend = (type === "Bar") || (type === "Line" && fillLines);

                        if (useBlockLegend) {
                            var rectShape = symbolGrpContents.addProperty("ADBE Vector Shape - Rect");
                            if (rectShape) {
                                var rectSize = safeProperty(rectShape, "ADBE Vector Rect Size", 1, "Size");
                                var swatchSize = currentFontSize * 1.1;
                                if (rectSize) rectSize.setValue([swatchSize, swatchSize]);
                                var rectPos = safeProperty(rectShape, "ADBE Vector Rect Position", 2, "Position");
                                if (rectPos) rectPos.setValue([0, 0]);
                            }

                            var shouldFillLegend = (type === "Bar" && fillBars) || (type === "Line" && fillLines);
                            if (shouldFillLegend) {
                                var sFill = symbolGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                if (sFill) {
                                    var fCol = safeProperty(sFill, "ADBE Vector Fill Color", 4, "Color");
                                    if (fCol) {
                                        fCol.setValue((type === "Line" && !customFill) ? seriesColorObj.stroke : seriesColorObj.fill);
                                    }
                                    
                                    // If drawing an Area Fill (Line with fillLines active), match the lower opacity of the graph fill inside the legend block!
                                    if (type === "Line" && fillLines) {
                                        var fOp = safeProperty(sFill, "ADBE Vector Fill Opacity", 5, "Opacity");
                                        if (fOp) {
                                            // FIXED: Syncs custom opacity directly to legend swatch Fill opacity if Custom Fill is active
                                            var areaOpacityValue = isNaN(customFillOpacity) ? 30 : Math.min(Math.max(customFillOpacity, 0), 100);
                                            var legendOpValue = customFill ? areaOpacityValue : 30;
                                            fOp.setValue(legendOpValue); 
                                        }
                                    }
                                }
                            }
                            var shouldStrokeLegend = (type === "Bar" && strokeBars) || (type === "Line" && strokeLines);
                            if (shouldStrokeLegend) {
                                var sStroke = symbolGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                                if (sStroke) {
                                    var stCol = safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color");
                                    if (stCol) stCol.setValue(seriesColorObj.stroke);
                                    var stWidth = safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                                    if (stWidth) stWidth.setValue(currentStrokeWidth);
                                }
                            }
                        } else {
                            var lineShape = symbolGrpContents.addProperty("ADBE Vector Shape - Group");
                            if (lineShape) {
                                var lPath = new Shape();
                                var lineSpan = currentFontSize * 1.5;
                                lPath.vertices = [
                                    [-(lineSpan / 2), 0],
                                    [(lineSpan / 2), 0] 
                                ];
                                lPath.closed = false;
                                var pProp = safeProperty(lineShape, "ADBE Vector Shape", 1, "Path");
                                if (pProp) pProp.setValue(lPath);
                            }

                            var sStroke = symbolGrpContents.addProperty("ADBE Vector Graphic - Stroke");
                            if (sStroke) {
                                var stCol = safeProperty(sStroke, "ADBE Vector Stroke Color", 4, "Color");
                                if (stCol) stCol.setValue(seriesColorObj.stroke);
                                var stWidth = safeProperty(sStroke, "ADBE Vector Stroke Width", 5, "Stroke Width");
                                if (stWidth) stWidth.setValue(currentStrokeWidth);
                            }

                            if (dots) {
                                var dotShape = symbolGrpContents.addProperty("ADBE Vector Shape - Ellipse");
                                if (dotShape) {
                                    var dSize = safeProperty(dotShape, "ADBE Vector Ellipse Size", 1, "Size");
                                    var circleSize = currentFontSize * 0.55;
                                    if (dSize) dSize.setValue([circleSize, circleSize]);
                                    var dPos = safeProperty(dotShape, "ADBE Vector Ellipse Position", 2, "Position");
                                    if (dPos) dPos.setValue([0, 0]);
                                }
                                var dFill = symbolGrpContents.addProperty("ADBE Vector Graphic - Fill");
                                if (dFill) {
                                    var dfCol = safeProperty(dFill, "ADBE Vector Fill Color", 4, "Color");
                                    if (dfCol) dfCol.setValue(seriesColorObj.stroke);
                                }
                            }
                        }

                        if (symTrans) {
                            var symOpProp = safeProperty(symTrans, "ADBE Vector Opacity", 7, "Opacity");
                            if (symOpProp) {
                                var symFadeStart = animateAxes ? 0.9 + (gIdx * 0.1) : 0.0;
                                var symFadeEnd = animateAxes ? 1.4 + (gIdx * 0.1) : 0.5;
                                symOpProp.setValueAtTime(symFadeStart, 0);
                                symOpProp.setValueAtTime(symFadeEnd, 100);
                            }
                        }
                    }

                    // Advance horizontal cursor
                    if (legendOrientation === "Horizontal") {
                        currentX += itemWidths[gIdx];
                    }
                }
            }
        }
        // =====================================================================
    }

    // Unbreakable axis line builder with optional Trim Paths animation
    function drawAxis(comp, x, y, w, h, strokeWidthValue, animateAxes, drawX, drawY, rightYAxis){
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
                        // Span X line from left margin to right margin independently of Y-axis position
                        if (pathProp) pathProp.setValue(makeLineShape(CONFIG.margin, y, comp.width - CONFIG.margin, y));
                    }
                }

                if (drawY) {
                    var yLine = gg.addProperty("ADBE Vector Shape - Group");
                    if (yLine) {
                        yLine.name = "Y_Axis";
                        var pathProp = safeProperty(yLine, "ADBE Vector Shape", 1, "Path");
                        if (pathProp) pathProp.setValue(makeLineShape(x, y, x, y - h));
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
    }

    // Initialize UI execution context
    var ui = buildUI(thisObj);
    if(ui instanceof Window){ 
        ui.center(); 
        ui.show(); 
    }

    // Dynamic clean selection restore
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

})(this);