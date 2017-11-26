
var util = require ('util');

var SHADER_TYPES = { vertex:'VERTEX_SHADER', fragment:'FRAGMENT_SHADER' };
var STR_TYPE = '(?:(?:mediump |highp )?(int|float|[iud]?vec[234]|sampler2D))';
var RE_UNIFORM = new RegExp (util.format ('uniform %s (\\w+);', STR_TYPE), 'g');
var STR_INTERP = '(?:flat |smooth |noperspective )?';
var RE_IN = new RegExp (util.format ('%sin %s (\\w+);', STR_INTERP, STR_TYPE), 'g');
var RE_OUT = new RegExp (util.format ('%sout %s (\\w+);', STR_INTERP, STR_TYPE), 'g');

var UNIFORM_WRITERS = {
    int:        'uniform1i',
    float:      'uniform1f',
    sampler2D:  'uniform1i',
    vec2:       'uniform2fv',
    dvec2:      'uniform2fv',
    ivec2:      'uniform2iv',
    uvec2:      'uniform2iv',
    vec3:       'uniform3fv',
    dvec3:      'uniform3fv',
    ivec3:      'uniform3iv',
    uvec3:      'uniform3iv',
    vec4:       'uniform4fv',
    dvec4:      'uniform4fv',
    ivec4:      'uniform4iv',
    uvec4:      'uniform4iv'
};

var ATTRIB_ARGS = {
    int:        [ null, 1, WebGL2RenderingContext.INT, false, 0, 0 ],
    float:      [ null, 1, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    vec2:       [ null, 2, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    dvec2:      [ null, 2, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    ivec2:      [ null, 2, WebGL2RenderingContext.INT, false, 0, 0 ],
    uvec2:      [ null, 2, WebGL2RenderingContext.INT, false, 0, 0 ],
    vec3:       [ null, 3, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    dvec3:      [ null, 3, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    ivec3:      [ null, 3, WebGL2RenderingContext.INT, false, 0, 0 ],
    uvec3:      [ null, 3, WebGL2RenderingContext.INT, false, 0, 0 ],
    vec4:       [ null, 4, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    dvec4:      [ null, 4, WebGL2RenderingContext.FLOAT, false, 0, 0 ],
    ivec4:      [ null, 4, WebGL2RenderingContext.INT, false, 0, 0 ],
    uvec4:      [ null, 4, WebGL2RenderingContext.INT, false, 0, 0 ]
};

function compile (context, shaderSource) {
    var shaders = {};
    var errors = [];
    var info = { vertex:{}, fragment:{} };
    for (var shaderType in shaderSource) {
        shaders[shaderType] = {};
        for (var name in shaderSource[shaderType]) {
            var source = shaderSource[shaderType][name];
            if (source.match (/^[\s\n\r]*$/))
                continue;
            var shader = context.createShader (context[SHADER_TYPES[shaderType]]);
            context.shaderSource (shader, source);
            context.compileShader (shader);
            var didSucceed = context.getShaderParameter (shader, context.COMPILE_STATUS);
            if (didSucceed) {
                shaders[shaderType][name] = shader;
                var parts = name.split ('_');
                if (parts.length > 1) {
                    if (!shaders[shaderType][parts[0]])
                        shaders[shaderType][parts[0]] = {};
                    shaders[shaderType][parts[0]][parts[1]] = shader;
                }
            } else {
                errors.push ({
                    name:   name,
                    log:    context.getShaderInfoLog (shader),
                    source: source
                });
                continue;
            }

            var match;
            RE_UNIFORM.lastIndex = 0;
            var shaderInfo = info[shaderType][name] = { uniform:{}, attrib:{} };
            while (match = RE_UNIFORM.exec (source))
                shaderInfo.uniform[match[2]] = match[1];

            if (shaderType !== 'vertex')
                continue;
            RE_IN.lastIndex = 0;
            while (match = RE_IN.exec (source))
                shaderInfo.attrib[match[2]] = match[1];
        }
    }
    if (errors.length) {
        for (var i=0,j=errors.length; i<j; i++) {
            console.log ('\n');
            console.log (errors[i].name);
            console.log (errors[i].log);
        }
        console.log ('\n');
        throw new Error ('SHADERS REJECTED');
    }

    // build programs
    // one for each pairing of vertex shader to fragment shader
    // or name_subname fragment shader
    var programs = {};
    for (var name in shaders.vertex) {
        var vertexShader = shaders.vertex[name];
        var frag = shaders.fragment[name];
        // is fragment shader a single shader or a set?
        if (frag.__proto__ !== Object.prototype)
            programs[name] = setup (frag, name, name);
        else {
            // shader set
            var subset = programs[name] = {};
            for (var subname in frag)
                subset[subname] = setup (frag[subname], name, name+'_'+subname);
        }
        function setup (fragShader, programName, logName) {
            var links = { uniform:{}, attrib:{} };
            var buffers = {};

            var program = context.createProgram();
            var vao = context.createVertexArray();
            context.attachShader (program, vertexShader);
            context.attachShader (program, fragShader);
            context.linkProgram (program);
            if (!context.getProgramParameter (program, context.LINK_STATUS)) {
                errors.push ({
                    name:   logName,
                    log:    context.getProgramInfoLog (program)
                });
                context.deleteProgram (program);
                return;
            }
            context.useProgram (program);

            // get variable location pointers
            var programUniforms = {};
            var programAttributes = info.vertex[programName].attrib;
            for (var name in info.vertex[programName].uniform) {
                links.uniform[name] = context.getUniformLocation (program, name);
                programUniforms[name] = info.vertex[programName].uniform[name];
            }
            for (var name in info.fragment[logName].uniform)
                if (!Object.hasOwnProperty.call (links.uniform, name)) {
                    links.uniform[name] = context.getUniformLocation (program, name);
                    programUniforms[name] = info.fragment[logName].uniform[name];
                }
            for (var name in programAttributes) {
                links.attrib[name] = context.getAttribLocation (program, name);
                buffers[name] = context.createBuffer();
            }

            return {
                links:          links,
                buffers:        buffers,
                bind:           function(){
                    context.useProgram (program);
                    context.bindVertexArray (vao);
                },
                writeUniform:   function (name, value) {
                    context[UNIFORM_WRITERS[programUniforms[name]]] (
                        links.uniform[name],
                        value
                    );
                },
                writeAttribs:   function (/* ...ArrayBuffer instances */) {
                    var i=0;
                    for (var name in links.attrib) {
                        var data = arguments[i];
                        i++;
                        if (!data)
                            continue;
                        var args = ATTRIB_ARGS[info.vertex[programName].attrib[name]];
                        var link = links.attrib[name];
                        args[0] = link;
                        context.bindBuffer (context.ARRAY_BUFFER, buffers[name]);
                        context.bufferData (context.ARRAY_BUFFER, data, context.STATIC_DRAW);
                        context.enableVertexAttribArray (link);
                        context.vertexAttribPointer.apply (context, args);
                    }
                }
            };
        }
    }

    if (errors.length) {
        for (var i=0,j=errors.length; i<j; i++) {
            console.log ('\n');
            console.log (errors[i].name);
            console.log (errors[i].log);
        }
        console.log ('\n');
        throw new Error ('PROGRAMS REJECTED');
    }

    return {
        shaders:    shaders,
        programs:   programs
    };
}

module.exports = compile;
