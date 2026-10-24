package com.spandan.recording.infrastructure.grpc;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.62.2)",
    comments = "Source: transcript_ingestion.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class TranscriptIngestionGrpc {

  private TranscriptIngestionGrpc() {}

  public static final java.lang.String SERVICE_NAME = "spandan.recording.TranscriptIngestion";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest,
      com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck> getStreamTranscriptMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "StreamTranscript",
      requestType = com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest.class,
      responseType = com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck.class,
      methodType = io.grpc.MethodDescriptor.MethodType.BIDI_STREAMING)
  public static io.grpc.MethodDescriptor<com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest,
      com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck> getStreamTranscriptMethod() {
    io.grpc.MethodDescriptor<com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest, com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck> getStreamTranscriptMethod;
    if ((getStreamTranscriptMethod = TranscriptIngestionGrpc.getStreamTranscriptMethod) == null) {
      synchronized (TranscriptIngestionGrpc.class) {
        if ((getStreamTranscriptMethod = TranscriptIngestionGrpc.getStreamTranscriptMethod) == null) {
          TranscriptIngestionGrpc.getStreamTranscriptMethod = getStreamTranscriptMethod =
              io.grpc.MethodDescriptor.<com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest, com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.BIDI_STREAMING)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "StreamTranscript"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck.getDefaultInstance()))
              .setSchemaDescriptor(new TranscriptIngestionMethodDescriptorSupplier("StreamTranscript"))
              .build();
        }
      }
    }
    return getStreamTranscriptMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static TranscriptIngestionStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TranscriptIngestionStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TranscriptIngestionStub>() {
        @java.lang.Override
        public TranscriptIngestionStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TranscriptIngestionStub(channel, callOptions);
        }
      };
    return TranscriptIngestionStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static TranscriptIngestionBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TranscriptIngestionBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TranscriptIngestionBlockingStub>() {
        @java.lang.Override
        public TranscriptIngestionBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TranscriptIngestionBlockingStub(channel, callOptions);
        }
      };
    return TranscriptIngestionBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static TranscriptIngestionFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TranscriptIngestionFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TranscriptIngestionFutureStub>() {
        @java.lang.Override
        public TranscriptIngestionFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TranscriptIngestionFutureStub(channel, callOptions);
        }
      };
    return TranscriptIngestionFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     */
    default io.grpc.stub.StreamObserver<com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest> streamTranscript(
        io.grpc.stub.StreamObserver<com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck> responseObserver) {
      return io.grpc.stub.ServerCalls.asyncUnimplementedStreamingCall(getStreamTranscriptMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service TranscriptIngestion.
   */
  public static abstract class TranscriptIngestionImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return TranscriptIngestionGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service TranscriptIngestion.
   */
  public static final class TranscriptIngestionStub
      extends io.grpc.stub.AbstractAsyncStub<TranscriptIngestionStub> {
    private TranscriptIngestionStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TranscriptIngestionStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TranscriptIngestionStub(channel, callOptions);
    }

    /**
     */
    public io.grpc.stub.StreamObserver<com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest> streamTranscript(
        io.grpc.stub.StreamObserver<com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck> responseObserver) {
      return io.grpc.stub.ClientCalls.asyncBidiStreamingCall(
          getChannel().newCall(getStreamTranscriptMethod(), getCallOptions()), responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service TranscriptIngestion.
   */
  public static final class TranscriptIngestionBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<TranscriptIngestionBlockingStub> {
    private TranscriptIngestionBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TranscriptIngestionBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TranscriptIngestionBlockingStub(channel, callOptions);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service TranscriptIngestion.
   */
  public static final class TranscriptIngestionFutureStub
      extends io.grpc.stub.AbstractFutureStub<TranscriptIngestionFutureStub> {
    private TranscriptIngestionFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TranscriptIngestionFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TranscriptIngestionFutureStub(channel, callOptions);
    }
  }

  private static final int METHODID_STREAM_TRANSCRIPT = 0;

  private static final class MethodHandlers<Req, Resp> implements
      io.grpc.stub.ServerCalls.UnaryMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ServerStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ClientStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.BidiStreamingMethod<Req, Resp> {
    private final AsyncService serviceImpl;
    private final int methodId;

    MethodHandlers(AsyncService serviceImpl, int methodId) {
      this.serviceImpl = serviceImpl;
      this.methodId = methodId;
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public void invoke(Req request, io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        default:
          throw new AssertionError();
      }
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public io.grpc.stub.StreamObserver<Req> invoke(
        io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_STREAM_TRANSCRIPT:
          return (io.grpc.stub.StreamObserver<Req>) serviceImpl.streamTranscript(
              (io.grpc.stub.StreamObserver<com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck>) responseObserver);
        default:
          throw new AssertionError();
      }
    }
  }

  public static final io.grpc.ServerServiceDefinition bindService(AsyncService service) {
    return io.grpc.ServerServiceDefinition.builder(getServiceDescriptor())
        .addMethod(
          getStreamTranscriptMethod(),
          io.grpc.stub.ServerCalls.asyncBidiStreamingCall(
            new MethodHandlers<
              com.spandan.recording.infrastructure.grpc.TranscriptSegmentRequest,
              com.spandan.recording.infrastructure.grpc.TranscriptIngestionAck>(
                service, METHODID_STREAM_TRANSCRIPT)))
        .build();
  }

  private static abstract class TranscriptIngestionBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    TranscriptIngestionBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.spandan.recording.infrastructure.grpc.TranscriptIngestionOuterClass.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("TranscriptIngestion");
    }
  }

  private static final class TranscriptIngestionFileDescriptorSupplier
      extends TranscriptIngestionBaseDescriptorSupplier {
    TranscriptIngestionFileDescriptorSupplier() {}
  }

  private static final class TranscriptIngestionMethodDescriptorSupplier
      extends TranscriptIngestionBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    TranscriptIngestionMethodDescriptorSupplier(java.lang.String methodName) {
      this.methodName = methodName;
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.MethodDescriptor getMethodDescriptor() {
      return getServiceDescriptor().findMethodByName(methodName);
    }
  }

  private static volatile io.grpc.ServiceDescriptor serviceDescriptor;

  public static io.grpc.ServiceDescriptor getServiceDescriptor() {
    io.grpc.ServiceDescriptor result = serviceDescriptor;
    if (result == null) {
      synchronized (TranscriptIngestionGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new TranscriptIngestionFileDescriptorSupplier())
              .addMethod(getStreamTranscriptMethod())
              .build();
        }
      }
    }
    return result;
  }
}
