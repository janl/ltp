var {getMinimumSize, assertNonOverlapping, encodeField, decodeField} = require('./utils')

function ObjectCodec(schema) {
  assertNonOverlapping(schema)
  var min = getMinimumSize(schema)
  function encode (obj, buffer, start, end) {
    var free = min
    if(isNaN(free)) throw new Error('min size was nan')
    for(var i = 0; i < schema.length; i++) {
      var field = schema[i]
      if(!field.isLength) {
        var value = obj[field.name]
        free += encodeField(field.position, field.direct, field.pointed, value, buffer, start, free)
        if(isNaN(free)) throw new Error('free was nan after field:'+i)
      }
    }

    //the length field must be first
    if(schema[0].isLength) {
      var field = schema[0]
      encodeField(field.position, field.direct, null, free, buffer, start)
    }
    
    //if this was encoded as a pointed field
    //we need to know how far the free pointer has moved.
    //hmm, encodeField returns only the pointed bytes used
    //not the direct bytes, but that's an private interface.
    //other encoders
    encode.bytes = free
  }

  function decode (buffer, start, end=buffer.length) {
    end = Math.min(end, buffer.length)
    var a = {} //new Array(schema.length)
    for(var i = 0; i < schema.length; i++) {
      var field = schema[i]
      a[field.name] = decodeField(field.position, field.direct, field.pointed, buffer, start, end)

      //remember the bytes, if length is included
      if(i === 0 && field.isLength) {
        decode.bytes = a[field.name]
        var _end = start + decode.bytes
        if(_end > end) throw new Error('length field out of bounds')
        //but a smaller value for end is acceptable.
        end = _end
      }
    }

    if(schema[0].isLength) {
      var field = schema[0]
      //var length = decodeField(field.position, field.direct, null, free, buffer, start)
      decode.bytes = a[schema[0].name]
    }
    //    else
    //decode.bytes = ??? 

    //calculating the total bytes decoded is a bit tricky because it's actually possible,
    //with relative pointers, that the bytes are not contigious.
    //for example, it's possible that nested objects share references to poinded values.
    //in cases where you actually need this, a length field should be included.
    return a
  }

  //I want to be able to decode a path.
  //foo.bar.baz[10] and do a fixed number of reads
  //and then decode the value (hopefully a primitive)

  function get_field (index) {
    return Number.isInteger(index) ? schema[index] : schema.find(v => v.name == index)
  }

  function dereference (buffer, start, index) {
    var length = min
    var field = get_field(index)
    if(!field) throw new Error('cannot dereference invalid field:' + index)
    var position = field.position
    if(!field.pointed)
      //might be a embedded fixed sized value, not a primitive
      //so better to return pointer than to decode here
      return start + position //return pointer to direct value
    else {
      var relp = field.direct.decode(buffer, start + position)
      if(relp === 0) return -1
      return (start + position) + relp
    }
  }

  function reflect (index) {
    var field = get_field(index)
    if(!field) throw new Error('invalid field:'+index)
    return field.pointed ? field.pointed : field.direct
  }

  function encodingLength (value) {
    var v_size = 0
    for(var i = 0; i < schema.length; i++) {
      var field = schema[i]
      if(field.pointed) {
        var fv = value[field.name]
        if(fv != null)
          v_size += field.pointed.encodingLength(fv)
        else if(!field.isNullable)
          throw new Error('field:'+field.name+' is not nullable, but no value provided')
      }
    }
    return min + v_size
  }

  return {
    type:'object',
    encode, decode, dereference, reflect, encodingLength//, encodedLength
  }
}

module.exports = ObjectCodec