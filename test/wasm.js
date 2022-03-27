var fs = require('fs')
var path = require('path')
var ltp = require('../index')

var tape = require('tape')


var wasm, memory, start, module

tape('init', function (t) {
  var src = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'ltp.wasm')))
  WebAssembly.instantiate(src, {

  }).then(function (_module) {
    module = _module
    memory = Buffer.from(module.instance.exports.memory.buffer)
    start = module.instance.exports.__heap_base.value
    wasm = module.instance.exports
    t.end()
  })
})
  
var O = ltp.ObjectCodec([
  ltp.DirectField('foo', 0, ltp.codex.u8),
  ltp.DirectField('bar', 1, ltp.codex.u32),
  ltp.PointedField('name', 5, ltp.codex.u8, ltp.codex.string_u8),
  ltp.PointedField('list', 6, ltp.codex.u8, ltp.ArrayCodec(ltp.codex.u8, ltp.codex.u8, ltp.codex.string_u8))
])

var expected = {foo: 1, bar: 1234, name: 'Hello, World!', list: ['foo', 'bar', 'baz']} 

var baz
// reads types, u9, u32, string_length__u8, string__u8
// (field positions are hard coded)
tape('read raw data', function (t) {

  var length = O.encode(expected, memory, start)
  baz = start+O.encode.bytes
  ltp.codex.string_u8.encode('baz', memory, baz)
  console.log(memory.slice(start, start+30))


  t.equal(wasm.decode__u8(start), expected.foo)
  t.equal(wasm.decode__u32(start+1), expected.bar)
  var length = wasm.decode_string_length__u8(wasm.decode_relp__u8(start+5)) 

  console.log(O.decode(memory, start))

  t.equal(length, expected.name.length)
  var str = wasm.decode_string__u8(wasm.decode_relp__u8(start+5))
  console.log(str)
  t.equal(memory.slice(str, str+length).toString(), expected.name)
//  module.instance.exports

  t.end()
})

function decode_string(ptr) {
  var length = wasm.decode_string_length__u8(ptr) 
  var str = wasm.decode_string__u8(ptr)
  return memory.toString('utf8', str, str+length)
}

// uses generated methods (with named fields) to read fields
// uses generated methods to read pointers, and generic methods to read values.
// (could use generated methods here that do not suffix the field type)
// decode__basic_name__length ???
tape('read via generated apis', function (t) {
  t.equal(wasm.decode__basic_foo(start), expected.foo)
  t.equal(wasm.decode__basic_bar(start), expected.bar)
  t.equal(decode_string(wasm.decode__basic_name(start)), expected.name)
  var list = wasm.decode__basic_list(start)

  var table = wasm.__indirect_function_table
  console.log('table.length', table.length)
  // tried to pass in a js function to callback but it doesn't seem to work like that.
  //  table.grow(1)
  //  table.set(0, function (a, b) { return a === b })
  t.equal(wasm.decode_array_length__u8(list), expected.list.length)

  for(var i = 0; i < expected.list.length; i++) {
    console.log('list['+i+']='+wasm.decode_array_index__u8(list, i))
    t.equal(decode_string(wasm.decode_array_index__u8(list, i)), expected.list[i])
  }

  console.log([
    wasm.decode_array_index__u8(list, 0),
    wasm.decode_array_index__u8(list, 1),
    wasm.decode_array_index__u8(list, 2)
  ])

  //can look up indexes of matching strings
  for(var i = 0; i < expected.list.length; i++) {
    var last = wasm.decode_array_index__u8(list, i)
    t.equal(wasm.array_index_of__string_u8(list, last), i)
  }

    t.equal(wasm.array_index_of__string_u8(list, baz), 2)

//  t.equal(decode_string(), expected.name, expected name)
  t.end()
})
//*/

tape('encode via C', function (t) {

  wasm.encode__basic_foo(start, 10)
  wasm.encode__basic_bar(start, 1_000)
  t.equal(wasm.decode__basic_foo(start), 10)
  t.equal(wasm.decode__basic_bar(start), 1_000)
  t.deepEqual(O.decode(memory, start), {...expected, foo:10, bar:1_000, })
  t.end()
})


// no this isn't that interesting,
// bigger question is how to encode
/*
tape('same as bipf benchmark', function (t) {
  wasm.map__get__string_u8(
    wasm.decode__package_dependencies,
    Varint
  )
  t.end()
})
*/